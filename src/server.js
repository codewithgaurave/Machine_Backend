import 'dotenv/config'
import app from './app.js'
import { connectDB } from './config/db.js'
import { initializeFirebase } from './config/firebase.js'

import { initSocket } from './socket.js'

const PORT = process.env.PORT || 5000

// Connect Database & Services
connectDB()
initializeFirebase()

const HOST = process.env.HOST || '0.0.0.0'

// Start Listening
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on http://${HOST}:${PORT}`)
  console.log(`📋 API Health Check: http://localhost:${PORT}/api/v1/health`)
})

// Initialize Real-Time Socket.IO
initSocket(server)

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`⚠️ Unhandled Rejection: ${err.message}`)
})
