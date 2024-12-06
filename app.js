const express = require('express');
const multer = require('multer');
const path = require('path');
const tesseract = require('tesseract.js');
const fs = require('fs');
const ejs = require('ejs');

const app = express();
const port = process.env.PORT || 3000;

// Setup the storage for Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Middlewares
app.use(express.static('public'));  // Serve static files like CSS, JS
app.use(express.urlencoded({ extended: true }));  // To parse form data
app.set('view engine', 'ejs');

// Helper function to read the good and bad dances with custom descriptions
const readDanceFile = (filePath) => {
  const danceFile = fs.readFileSync(filePath, 'utf-8').split('\n').map(line => line.trim()).filter(line => line);
  const danceDescriptions = {};

  danceFile.forEach(line => {
    const [dance, description] = line.split(':').map(part => part.trim().toLowerCase());
    if (dance && description) {
      danceDescriptions[dance] = description;
    }
  });

  return danceDescriptions;
};

// Helper function to append a new dance to a file
const appendToDanceFile = (filePath, danceName, description) => {
  const danceLine = `${danceName}: ${description}\n`;
  fs.appendFileSync(filePath, danceLine, 'utf8');
};

// Read good and bad dances with their custom descriptions
const goodDances = readDanceFile('gooddances.txt');
const badDances = readDanceFile('baddances.txt');

// OCR function using Tesseract.js
const ocrImage = (imagePath) => {
  return new Promise((resolve, reject) => {
    tesseract.recognize(imagePath, 'eng', { logger: (m) => console.log(m) })
      .then(({ data: { text } }) => resolve(text))
      .catch(reject);
  });
};

// Route to display the home page (Upload form and Add dance form)
app.get('/', (req, res) => {
  res.render('index', { message: 'Upload an image to process!', goodDances, badDances, dances: [] });
});

// Route to handle file upload and processing
app.post('/upload', upload.single('danceImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.send('Please upload an image!');
    }

    const imagePath = req.file.path;
    
    // OCR extraction
    const extractedText = await ocrImage(imagePath);
    
    // Process the extracted text (split by new lines and format)
    const danceList = extractedText.split('\n')
      .map(dance => dance.trim().toLowerCase())  // Convert to lowercase for case-insensitive comparison
      .filter(dance => dance);
    
    // Add custom descriptions from good/bad dances list
    const formattedDanceList = danceList.map(dance => {
      let description = 'No description available';
      if (goodDances[dance]) {
        description = goodDances[dance]; // Custom description for good dance
      } else if (badDances[dance]) {
        description = badDances[dance]; // Custom description for bad dance
      }
      return { name: dance, description };
    });

    // Pass goodDances and badDances to the view
    res.render('index', { dances: formattedDanceList, goodDances, badDances });

  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).send('Error processing the image');
  }
});

// Route to handle adding a new dance
app.post('/add-dance', (req, res) => {
  const { danceName, description, listType } = req.body;

  if (listType === 'good') {
    appendToDanceFile('gooddances.txt', danceName, description);
    goodDances[danceName.toLowerCase()] = description;  // Update in-memory list
  } else if (listType === 'bad') {
    appendToDanceFile('baddances.txt', danceName, description);
    badDances[danceName.toLowerCase()] = description;  // Update in-memory list
  }

  // Redirect back to the main page after adding a dance
  res.redirect('/');
});

// Start the server

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
