import mongoose from 'mongoose'

const reportSubSchema = new mongoose.Schema(
  {
    reporterName: { type: String, default: 'Anonymous User' },
    reporterEmail: { type: String, default: 'anonymous@machinerywallah.com' },
    reason: { type: String, required: true },
    description: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    time: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Pending', 'Resolved', 'Dismissed'],
      default: 'Pending',
    },
    actionTaken: { type: String, default: '' },
    resolvedAt: { type: Date },
    resolvedBy: { type: String, default: '' },
  },
  { _id: true, timestamps: true }
)

const historySubSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    author: { type: String, default: 'System' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const listingSchema = new mongoose.Schema(
  {
    listingCode: { type: String, unique: true, index: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '' },
    category: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: ['Rent', 'Sale', 'Transport', 'MaterialSupply'], index: true },
    rateOrPrice: { type: String, required: true },
    rateUnit: { type: String, default: 'per day' },
    securityDeposit: { type: String, default: 'N/A' },
    minDuration: { type: String, default: 'Flexible' },
    operatorIncluded: { type: Boolean, default: false },

    // Equipment Specs
    modelYear: { type: String, default: '2023' },
    hoursUsed: { type: String, default: '0 hrs' },
    description: { type: String, default: '' },
    insuranceValidTill: { type: String, default: 'N/A' },
    specifications: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Owner / Location
    ownerName: { type: String, required: true, index: true },
    ownerPhone: { type: String, required: true },
    ownerKyc: { type: String, default: 'Verified' },
    location: {
      city: { type: String, default: 'Lucknow' },
      state: { type: String, default: 'Uttar Pradesh' },
      address: { type: String, default: '' },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      // GeoJSON Point for geospatial $near queries (only populated when lat/lng are provided)
      geo: {
        type: {
          type: String,
          enum: ['Point'],
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
        },
      },
    },

    // Documents & Moderation
    rcNumber: { type: String, trim: true, default: '' },
    documents: {
      rc: { type: String, default: '' },
      insurance: { type: String, default: '' },
      fitness: { type: String, default: '' },
      serviceRecord: { type: String, default: '' },
      permit: { type: String, default: '' },
      puc: { type: String, default: '' },
      gst: { type: String, default: '' },
      testReport: { type: String, default: '' },
      quarryPermit: { type: String, default: '' },
      weighbridge: { type: String, default: '' },
    },
    docStatus: { type: String, default: 'Pending Verification' },
    approvalStatus: {
      type: String,
      default: 'Pending',
      enum: ['Pending', 'Approved', 'Rejected'],
      index: true,
    },
    approvedBy: { type: String, default: '' },
    approvalDate: { type: Date },
    rejectionReason: { type: String, default: '' },
    rejectionNote: { type: String, default: '' },
    reviewedBy: { type: String, default: '' },
    reviewedAt: { type: Date },

    // Operational Status
    status: {
      type: String,
      default: 'Inactive',
      enum: ['Active', 'Inactive', 'Pending', 'Under Review', 'Rejected'],
      index: true,
    },
    availability: {
      type: String,
      default: 'Available Now',
      enum: ['Available Now', 'On Rent', 'Sold', 'Under Maintenance'],
      index: true,
    },

    // Promotion & Featured
    isFeatured: { type: Boolean, default: false, index: true },
    promotionType: {
      type: String,
      default: 'None',
      enum: ['None', 'Featured', 'Spotlight', 'Top Listing', 'Promoted', 'Standard'],
      index: true,
    },
    promotionStartDate: { type: Date },
    promotionEndDate: { type: Date },
    promotionStatus: {
      type: String,
      default: 'None',
      enum: ['None', 'Active', 'Expired', 'Scheduled'],
    },
    promotionViews: { type: Number, default: 0 },

    // Reporting & Flags
    isReported: { type: Boolean, default: false, index: true },
    reportCount: { type: Number, default: 0 },
    reports: [reportSubSchema],

    // Assets & Metrics
    image: { type: String, default: '' },
    images: [{ type: String }],
    viewsCount: { type: Number, default: 0 },
    enquiriesCount: { type: Number, default: 0 },

    // Audit Trail
    history: [historySubSchema],
  },
  { timestamps: true }
)

listingSchema.index({ 'location.geo': '2dsphere' })
listingSchema.index({ 'location.city': 1 })

// Auto-generate unique listingCode if not present (e.g. MH-1001) and sync coordinates
listingSchema.pre('save', async function (next) {
  if (!this.listingCode) {
    const count = await mongoose.model('Listing').countDocuments()
    this.listingCode = `MH-${1001 + count}`
  }
  if (!this.image && this.images && this.images.length > 0) {
    this.image = this.images[0]
  }

  // Sync lat/lng into GeoJSON coordinates [longitude, latitude]
  if (this.location?.lat != null && this.location?.lng != null) {
    const lat = Number(this.location.lat)
    const lng = Number(this.location.lng)
    if (!isNaN(lat) && !isNaN(lng)) {
      this.location.geo = {
        type: 'Point',
        coordinates: [lng, lat],
      }
    } else {
      this.location.geo = undefined
    }
  } else if (!this.location?.geo?.coordinates || this.location.geo.coordinates.length < 2) {
    this.location.geo = undefined
  }

  next()
})

export const Listing = mongoose.model('Listing', listingSchema)
