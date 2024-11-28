const express = require('express')
const path = require('path')
const app = express()
const port = 3000

// Serve static files
app.use(express.static(path.join(__dirname, 'public')))

// Move HTML, CSS, JS files to public folder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(port, () => {
    console.log(`Investment calculator running at http://localhost:${port}`)
})
