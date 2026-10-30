import { Enquiry } from '../models/Enquiry.js'
import { Owner } from '../models/Owner.js'
import { Customer } from '../models/Customer.js'
import { Listing } from '../models/Listing.js'
import { sendPushNotification } from '../utils/fcmService.js'
import { successResponse, errorResponse } from '../utils/apiResponse.js'

// 1. Get All Enquiries (with search, filter, pagination, and real-time live counts)
export const getEnquiries = async (req, res) => {
  try {
    const {
      search = '',
      status = 'All',
      enquiryType = 'All',
      sellerPhone,
      listingId,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query

    const query = {}

    // Filter by specific listing if provided
    if (listingId && listingId.trim()) {
      query.listingId = listingId.trim()
    }

    // Strict Seller Isolation: If sellerPhone is passed (from Seller Mobile App),
    // ONLY return enquiries that Admin has explicitly assigned to this seller!
    if (sellerPhone && sellerPhone.trim()) {
      const cleanSellerPhone = sellerPhone.replace('+91', '').replace(/\s/g, '').trim()
      const last10 = cleanSellerPhone.length >= 10 ? cleanSellerPhone.slice(-10) : cleanSellerPhone
      const sellerRegex = new RegExp(last10 + '$', 'i')

      query.isAssignedToSeller = true
      query.$or = [
        { assignedSellerPhone: cleanSellerPhone },
        { assignedSellerPhone: sellerPhone.trim() },
        { assignedSellerPhone: sellerRegex },
      ]
    }

    // Search filter
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i')
      const searchCond = [
        { name: regex },
        { customerName: regex },
        { email: regex },
        { phone: regex },
        { machine: regex },
        { machineName: regex },
        { location: regex },
        { enquiryId: regex },
      ]
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchCond }]
        delete query.$or
      } else {
        query.$or = searchCond
      }
    }

    // Status filter
    if (status && status !== 'All') {
      query.status = status
    }

    // Enquiry Type filter (Buy / Rent)
    if (enquiryType && enquiryType !== 'All') {
      query.enquiryType = enquiryType
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, parseInt(limit, 10) || 10)
    const skip = (pageNum - 1) * limitNum

    const sortOrder = order === 'asc' ? 1 : -1
    const sortObj = { [sortBy]: sortOrder }

    const [enquiries, totalFiltered] = await Promise.all([
      Enquiry.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Enquiry.countDocuments(query),
    ])

    // Live counts for KPI cards and filter pill tabs
    const [totalAll, newCount, contactedCount, convertedCount, closedCount] = await Promise.all([
      Enquiry.countDocuments(query),
      Enquiry.countDocuments({ ...query, status: 'New' }),
      Enquiry.countDocuments({ ...query, status: 'Contacted' }),
      Enquiry.countDocuments({ ...query, status: 'Converted' }),
      Enquiry.countDocuments({ ...query, status: 'Closed' }),
    ])

    const totalPages = Math.ceil(totalFiltered / limitNum) || 1

    return successResponse(res, 'Enquiries retrieved successfully', {
      enquiries,
      pagination: {
        total: totalFiltered,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      counts: {
        all: totalAll,
        new: newCount,
        contacted: contactedCount,
        converted: convertedCount,
        closed: closedCount,
      },
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 2. Get Single Enquiry Details
export const getEnquiryById = async (req, res) => {
  try {
    const enquiry = await Enquiry.findById(req.params.id)
    if (!enquiry) {
      return errorResponse(res, 'Enquiry not found', 404)
    }
    return successResponse(res, 'Enquiry details retrieved', enquiry)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 3. Create Enquiry
export const createEnquiry = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      machine,
      enquiryType,
      location,
      budgetRange,
      requirementDate,
      message,
      category,
      pickupLocation,
      dropLocation,
      duration,
      dailyRate,
      startDate,
      endDate,
      quantity,
      unit,
      vehicleType,
      materialGrade,
      imageUrl,
      quotesCount,
      sellerPhone,
      sellerName,
      listingId,
    } = req.body

    if (!name || !phone || !machine) {
      return errorResponse(res, 'Name, phone and machine name are required', 400)
    }

    let finalSellerPhone = (sellerPhone || '').trim()
    let finalSellerName = (sellerName || '').trim()
    let finalListingId = listingId || null

    // If sellerPhone was not provided, automatically look up the machine in Listings
    if (!finalSellerPhone || !finalListingId) {
      const matchedListing = await Listing.findOne({
        $or: [
          ...(finalListingId ? [{ _id: finalListingId }] : []),
          { title: new RegExp(`^${machine.trim()}$`, 'i') },
        ],
      }).lean()

      if (matchedListing) {
        if (!finalListingId) finalListingId = matchedListing._id
        if (!finalSellerPhone) finalSellerPhone = matchedListing.ownerPhone || matchedListing.contactPhone || ''
        if (!finalSellerName) finalSellerName = matchedListing.ownerName || ''
      }
    }

    const enquiry = await Enquiry.create({
      name,
      customerName: name,
      phone,
      customerPhone: phone,
      email: email || '',
      customerEmail: email || '',
      machine,
      machineName: machine,
      fullMachineName: machine,
      listingId: finalListingId,
      sellerPhone: finalSellerPhone,
      sellerName: finalSellerName,
      enquiryType: enquiryType || 'Buy',
      location: location || 'India',
      budgetRange: budgetRange || '',
      requirementDate: requirementDate || 'Immediate',
      message: message || '',
      category: category || '',
      pickupLocation: pickupLocation || '',
      dropLocation: dropLocation || '',
      duration: duration || '',
      dailyRate: dailyRate || '',
      startDate: startDate || '',
      endDate: endDate || '',
      quantity: quantity || '',
      unit: unit || '',
      vehicleType: vehicleType || '',
      materialGrade: materialGrade || '',
      imageUrl: imageUrl || '',
      quotesCount: quotesCount || 0,
      isAssignedToSeller: false,
      status: 'New',
    })

    // Increment listing enquiriesCount if listing exists
    if (finalListingId) {
      Listing.findByIdAndUpdate(finalListingId, { $inc: { enquiriesCount: 1 } }).catch(() => {})
    }

    // Note: No direct push notification is sent to seller on creation.
    // Enquiry goes to Admin panel first, and push notification is sent only when Admin assigns it to a seller.

    return successResponse(res, 'Enquiry created successfully', enquiry, 201)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 4. Update Enquiry Status
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { status } = req.body
    if (!status || !['New', 'Contacted', 'Converted', 'Closed'].includes(status)) {
      return errorResponse(res, 'Valid status is required (New, Contacted, Converted, Closed)', 400)
    }

    const enquiry = await Enquiry.findById(req.params.id)
    if (!enquiry) {
      return errorResponse(res, 'Enquiry not found', 404)
    }

    const oldStatus = enquiry.status
    enquiry.status = status

    // Append to audit history
    enquiry.history.push({
      action: `Status updated from "${oldStatus}" to "${status}"`,
      author: req.user?.name || 'Admin',
      createdAt: new Date(),
    })

    await enquiry.save()

    // 🔥 Send Push notification to Customer about update
    try {
      const customerPhone = enquiry.customerPhone || enquiry.phone
      if (customerPhone) {
        const cleanPhone = customerPhone.replace('+91', '').replace(/\s/g, '').trim()
        const customer = await Customer.findOne({ phone: new RegExp(cleanPhone.slice(-10) + '$', 'i') })
        if (customer && customer.fcmTokens?.length > 0) {
          await sendPushNotification({
            tokens: customer.fcmTokens,
            title: `📋 Enquiry Update: ${enquiry.machine}`,
            body: `Aapki enquiry (${enquiry.enquiryId || enquiry.machine}) ka status ab "${status}" mark kar diya gaya hai.`,
            data: {
              type: 'ENQUIRY_STATUS_UPDATE',
              enquiryId: enquiry._id.toString(),
              status,
            },
          })
        }
      }
    } catch (pushErr) {
      console.warn('⚠️ [FCM] Status update push notification failed:', pushErr.message)
    }

    return successResponse(res, `Enquiry status changed to "${status}"`, enquiry)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 5. Add Note to Enquiry
export const addEnquiryNote = async (req, res) => {
  try {
    const { text } = req.body
    if (!text || !text.trim()) {
      return errorResponse(res, 'Note text cannot be empty', 400)
    }

    const enquiry = await Enquiry.findById(req.params.id)
    if (!enquiry) {
      return errorResponse(res, 'Enquiry not found', 404)
    }

    const author = req.user?.name || 'Admin'
    const newNote = {
      text: text.trim(),
      author,
      createdAt: new Date(),
    }

    enquiry.notes.push(newNote)
    enquiry.history.push({
      action: `Added note: "${text.trim().substring(0, 40)}${text.length > 40 ? '...' : ''}"`,
      author,
      createdAt: new Date(),
    })

    await enquiry.save()

    return successResponse(res, 'Note added successfully', enquiry)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 6. Assign Enquiry Executive (Internal Staff)
export const assignEnquiry = async (req, res) => {
  try {
    const { assignedTo } = req.body
    if (!assignedTo) {
      return errorResponse(res, 'Executive name is required', 400)
    }

    const enquiry = await Enquiry.findById(req.params.id)
    if (!enquiry) {
      return errorResponse(res, 'Enquiry not found', 404)
    }

    enquiry.assignedTo = assignedTo
    enquiry.history.push({
      action: `Assigned to ${assignedTo}`,
      author: req.user?.name || 'Admin',
      createdAt: new Date(),
    })

    await enquiry.save()

    return successResponse(res, `Enquiry assigned to ${assignedTo}`, enquiry)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 6b. Assign Enquiry Directly to a specific Seller (with Instant FCM Notification)
export const assignToSeller = async (req, res) => {
  try {
    const { sellerId, sellerPhone, sellerName, sellerCompany } = req.body
    if (!sellerPhone || !sellerPhone.trim()) {
      return errorResponse(res, 'Seller phone number is required to assign lead', 400)
    }

    const enquiry = await Enquiry.findById(req.params.id)
    if (!enquiry) {
      return errorResponse(res, 'Enquiry not found', 404)
    }

    const cleanSellerPhone = sellerPhone.replace('+91', '').replace(/\s/g, '').trim()
    const finalSellerName = sellerName || 'Partner Seller'
    const finalSellerCompany = sellerCompany || ''

    enquiry.isAssignedToSeller = true
    enquiry.assignedSellerPhone = cleanSellerPhone
    enquiry.assignedSellerName = finalSellerName
    enquiry.assignedSellerCompany = finalSellerCompany
    if (sellerId) enquiry.assignedSellerId = sellerId
    enquiry.assignedAt = new Date()
    enquiry.assignedBy = req.user?.name || 'Admin'

    enquiry.history.push({
      action: `Lead assigned to Seller: ${finalSellerName} (${cleanSellerPhone})`,
      author: req.user?.name || 'Admin',
      createdAt: new Date(),
    })

    await enquiry.save()

    // 🚀 Send targeted FCM push notification to assigned Seller
    try {
      const last10 = cleanSellerPhone.length >= 10 ? cleanSellerPhone.slice(-10) : cleanSellerPhone
      const owner = await Owner.findOne({
        $or: [
          ...(sellerId ? [{ _id: sellerId }] : []),
          { phone: cleanSellerPhone },
          { phone: new RegExp(last10 + '$', 'i') },
        ],
      }, 'fcmTokens name')

      if (owner && owner.fcmTokens?.length > 0) {
        await sendPushNotification({
          tokens: owner.fcmTokens,
          title: `🎉 New Lead Assigned: ${enquiry.machine}`,
          body: `Admin ne aapko ${enquiry.machine} ke liye ek verified customer (${enquiry.name}) assign kiya hai!`,
          data: {
            type: 'ENQUIRY_ASSIGNED',
            enquiryId: enquiry._id.toString(),
            machine: enquiry.machine,
            customerName: enquiry.name,
            customerPhone: enquiry.phone,
          },
        })
      }
    } catch (fcmErr) {
      console.warn('⚠️ [FCM] Notification to assigned seller failed:', fcmErr.message)
    }

    return successResponse(res, `Enquiry assigned to seller ${finalSellerName}`, enquiry)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 6c. Bulk Assign Multiple Enquiries to a Seller
export const bulkAssignToSeller = async (req, res) => {
  try {
    const { ids, sellerId, sellerPhone, sellerName, sellerCompany } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'Please provide an array of enquiry IDs', 400)
    }
    if (!sellerPhone || !sellerPhone.trim()) {
      return errorResponse(res, 'Seller phone number is required', 400)
    }

    const cleanSellerPhone = sellerPhone.replace('+91', '').replace(/\s/g, '').trim()
    const finalSellerName = sellerName || 'Partner Seller'
    const finalSellerCompany = sellerCompany || ''
    const assignedBy = req.user?.name || 'Admin'

    const result = await Enquiry.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          isAssignedToSeller: true,
          assignedSellerPhone: cleanSellerPhone,
          assignedSellerName: finalSellerName,
          assignedSellerCompany: finalSellerCompany,
          ...(sellerId ? { assignedSellerId: sellerId } : {}),
          assignedAt: new Date(),
          assignedBy,
        },
        $push: {
          history: {
            action: `Lead assigned to Seller: ${finalSellerName} (${cleanSellerPhone})`,
            author: assignedBy,
            createdAt: new Date(),
          },
        },
      }
    )

    // 🚀 Send Push Notification to Seller
    try {
      const last10 = cleanSellerPhone.length >= 10 ? cleanSellerPhone.slice(-10) : cleanSellerPhone
      const owner = await Owner.findOne({
        $or: [
          ...(sellerId ? [{ _id: sellerId }] : []),
          { phone: cleanSellerPhone },
          { phone: new RegExp(last10 + '$', 'i') },
        ],
      }, 'fcmTokens name')

      if (owner && owner.fcmTokens?.length > 0) {
        await sendPushNotification({
          tokens: owner.fcmTokens,
          title: `🎉 ${ids.length} Leads Assigned!`,
          body: `Admin ne aapko ${ids.length} naye verified customer leads assign kiye hain. Check App!`,
          data: {
            type: 'BULK_ENQUIRIES_ASSIGNED',
            count: String(ids.length),
          },
        })
      }
    } catch (fcmErr) {
      console.warn('⚠️ [FCM] Bulk notification failed:', fcmErr.message)
    }

    return successResponse(res, `${result.modifiedCount} enquiries assigned to ${finalSellerName}`, {
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 6d. Get Eligible / Matching Sellers for an Enquiry (filter by category / machine keywords)
export const getMatchingSellers = async (req, res) => {
  try {
    const { category = '', machine = '', search = '' } = req.query

    // 1. First find owners who have listings matching category or machine
    let listingOwnerPhones = []
    if (category.trim() || machine.trim()) {
      const listingOrConds = []
      if (category.trim()) {
        listingOrConds.push({ category: new RegExp(category.trim(), 'i') })
        listingOrConds.push({ type: new RegExp(category.trim(), 'i') })
      }
      if (machine.trim()) {
        const words = machine.trim().split(' ').filter((w) => w.length > 2)
        words.forEach((w) => {
          listingOrConds.push({ title: new RegExp(w, 'i') })
        })
      }

      if (listingOrConds.length > 0) {
        const matchedListings = await Listing.find({ $or: listingOrConds }, 'ownerPhone contactPhone ownerName title').lean()
        matchedListings.forEach((l) => {
          if (l.ownerPhone) listingOwnerPhones.push(l.ownerPhone.replace('+91', '').replace(/\s/g, '').trim())
          if (l.contactPhone) listingOwnerPhones.push(l.contactPhone.replace('+91', '').replace(/\s/g, '').trim())
        })
      }
    }

    listingOwnerPhones = [...new Set(listingOwnerPhones)].filter(Boolean)

    // 2. Build owner query
    const ownerQuery = {}

    if (search && search.trim()) {
      const sRegex = new RegExp(search.trim(), 'i')
      ownerQuery.$or = [
        { name: sRegex },
        { phone: sRegex },
        { companyName: sRegex },
        { city: sRegex },
      ]
    }

    // Fetch active sellers/owners from Owner collection
    const allOwners = await Owner.find(ownerQuery)
      .select('name phone email companyName city state status kycStatus totalListings')
      .sort({ createdAt: -1 })
      .lean()

    // Flag sellers who have matching listings for prioritization
    const formatted = allOwners.map((o) => {
      const cleanPhone = (o.phone || '').replace('+91', '').replace(/\s/g, '').trim()
      const isDirectMatch = listingOwnerPhones.includes(cleanPhone)
      return {
        ...o,
        isCategoryMatch: isDirectMatch,
      }
    })

    // Sort matching category sellers to top
    formatted.sort((a, b) => (b.isCategoryMatch ? 1 : 0) - (a.isCategoryMatch ? 1 : 0))

    return successResponse(res, 'Matching sellers retrieved', formatted)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 7. Delete Single Enquiry
export const deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndDelete(req.params.id)
    if (!enquiry) {
      return errorResponse(res, 'Enquiry not found', 404)
    }
    return successResponse(res, `Enquiry ${enquiry.enquiryId || ''} deleted successfully`)
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 8. Bulk Update Status
export const bulkUpdateEnquiryStatus = async (req, res) => {
  try {
    const { ids, status } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'Please provide an array of enquiry IDs', 400)
    }
    if (!status || !['New', 'Contacted', 'Converted', 'Closed'].includes(status)) {
      return errorResponse(res, 'Valid status is required', 400)
    }

    const result = await Enquiry.updateMany(
      { _id: { $in: ids } },
      {
        $set: { status },
        $push: {
          history: {
            action: `Bulk status updated to "${status}"`,
            author: req.user?.name || 'Admin',
            createdAt: new Date(),
          },
        },
      }
    )

    return successResponse(res, `${result.modifiedCount} enquiries marked as ${status}`, {
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}

// 9. Bulk Delete Enquiries
export const bulkDeleteEnquiries = async (req, res) => {
  try {
    const { ids } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 'Please provide an array of enquiry IDs', 400)
    }

    const result = await Enquiry.deleteMany({ _id: { $in: ids } })
    return successResponse(res, `${result.deletedCount} enquiries deleted successfully`, {
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    return errorResponse(res, error.message, 500)
  }
}
