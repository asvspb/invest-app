/**
 * @fileoverview Server setup for the Investment Calculator application.
 * Serves static files and handles the root route to serve the main HTML file.
 */

const express = require('express')
const path = require('path')
const app = express()
const port = 3000

/**
 * Middleware to serve static files from the 'public' directory.
 */
app.use(express.static(path.join(__dirname, 'public')))

/**
 * Route to serve the main HTML file.
 * @name get/
 * @function
 * @memberof module:server
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

/**
 * Starts the server and listens on the specified port.
 * @function
 * @memberof module:server
 * @param {number} port - The port number to listen on.
 */
app.listen(port, () => {
    console.log(`Investment calculator running at http://localhost:${port}`)
})
