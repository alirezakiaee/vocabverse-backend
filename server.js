require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql");
const jwt = require("jsonwebtoken");

const app = express();
const axios = require("axios");
const moment = require("moment"); // Import moment
app.use(cors());
app.use(express.json());

//-----------SENDGRID----------------
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post("/send-email", async (req, res) => {
  const { name, email, message } = req.body;

  // Replace the table content with the message variable
  const tableContent = `<table style="border-collapse: collapse; width: 100%;">
    <thead>
      <tr>
        <th style="border: 1px solid #ddd; text-align: left; padding: 8px;">Front</th>
        <th style="border: 1px solid #ddd; text-align: left; padding: 8px;">Status</th>
        <th style="border: 1px solid #ddd; text-align: left; padding: 8px;">Next Review</th>
        <th style="border: 1px solid #ddd; text-align: left; padding: 8px;">Actions</th>
      </tr>
    </thead>
    <tbody>
      ${message}
    </tbody>
  </table>`;

  const msg = {
    to: "alirezakiaee91@gmail.com",
    from: "alirezakiaee91@gmail.com",
    subject: "Daily reminder for Due Vocabularies",
    html: `
      <p>Name: ${name}</p>
      <p>Email: ${email}</p>
      ${tableContent}
    `,
  };

  try {
    await sgMail.send(msg, {
      headers: {
        "Content-Type": "application/json",
        bearer: process.env.SENDGRID_API_KEY,
      },
    });
    res.status(200).send("Email sent successfully");
  } catch (error) {
    console.error(error.response.body);
    res
      .status(500)
      .send(`Error sending email: ${JSON.stringify(error.response.body)}`);
  }
});

//-----------END of SENDGRID----------------
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

db.connect((err) => {
    if (err) {
        console.error("Error connecting to the database: ", err);
        return;
    }
    console.log("Connected to database");
});

app.post("/signup", (req, res) => {
    const { name, email, password } = req.body;
    
    const sqlInsert = "INSERT INTO login (name, email, password) VALUES (?, ?, ?)";
    
    db.query(sqlInsert, [name, email, password], (err, results) => {
        if (err) {
            console.error("Failed to insert new user: ", err);
            return res.status(500).json({ message: "Failed to register user", error: err });
        }
        
        res.status(201).json({ message: "User registered successfully", userId: results.insertId });
    });
});
app.post("/login", (req, res) => {
    const { email, password } = req.body;
    
    const sqlInsert = "SELECT * FROM login WHERE `email`= ? AND `password`= ? ";
    console.log(email, password);
    db.query(sqlInsert, [ email, password], (err, results) => {
        console.log(results);
        if (err) {
            console.error("Failed to find user: ", err);
            return res.status(500).json({ message: "Failed to find user", error: err });
        }
        if (results.length > 0) {
            // return res.json(results);
            const user = results[0]
            var token = jwt.sign({user: user }, 'shhhhh');
            console.log(token);
            return res.json({token: token});
            }
        
        else {
            return res.status(404).json({ message: "User not found" });
        }
        
    });
});

function authorize(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    jwt.verify(token, 'shhhhh', (err, user) => {
        if (err) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        req.user = user;
        next();
    });
}
app.get("/dashboard",authorize, (req, res) => {
    const id = req.user.user.id;
    console.log(id);
    return res.json(req.user);
});

app.get("/profile", authorize, (req, res) => {
    const userId = req.user.user.id;

    const sqlSelect = "SELECT * FROM login WHERE id = ?";
    
    db.query(sqlSelect, [userId], (err, results) => {
        if (err) {
            console.error("Failed to fetch user profile: ", err);
            return res.status(500).json({ message: "Failed to fetch user profile", error: err });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const userData = {
            id: results[0].id,
            name: results[0].name,
            email: results[0].email,
            profileImage: results[0].profileImage 
        };
        
        return res.json({ user: userData });
    });
});

// Endpoint to fetch vocabularies needing review for a specific box ID and user ID
app.get("/vocabs/:box_id/needs-review/:user_id", authorize, (req, res) => {
    const box_id = req.params.box_id;
    const user_id = req.user.user.id;
    console.log(box_id);
     console.log('here is user id', user_id);
    // Query to select vocabularies with status "needs review" for the given box_id and user_id
    const sqlSelect = "SELECT * FROM vocabs WHERE box_id = ? AND user_id = ?";

    db.query(sqlSelect, [box_id, user_id], (err, results) => {
        if (err) {
            console.error("Failed to fetch vocabularies needing review: ", err);
            return res.status(500).json({ message: "Failed to fetch vocabularies needing review", error: err });
        }

        // Send the fetched vocabularies as a response
        res.status(200).json(results);
    });
});

app.get("/boxes/:box_id", authorize, (req, res) => {
    const box_id = req.params.box_id;

    // Query to select the name of the box from the boxes table by box_id
    const sqlSelect = "SELECT name FROM boxes WHERE id = ?";

    db.query(sqlSelect, [box_id], (err, results) => {
        if (err) {
            console.error("Failed to fetch box name:", err);
            return res.status(500).json({ message: "Failed to fetch box name", error: err });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: "Box not found" });
        }

        // Send the fetched box name as a response
        res.status(200).json(results[0]);
    });
});

// Endpoint to delete a vocabulary row by ID
app.delete("/vocabs/:id", authorize, (req, res) => {
    const id = req.params.id;

    // Query to delete the vocabulary row from the vocabs table by ID
    const sqlDelete = "DELETE FROM vocabs WHERE id = ?";

    db.query(sqlDelete, [id], (err, result) => {
        if (err) {
            console.error("Failed to delete vocabulary:", err);
            return res.status(500).json({ message: "Failed to delete vocabulary", error: err });
        }

        // Check if the row was deleted successfully
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Vocabulary not found" });
        }

        // Send a success message
        res.status(200).json({ message: "Vocabulary deleted successfully" });
    });
});

app.get("/vocabs/due-today/", authorize, (req, res) => {
    console.log("Fetching vocabularies due today...");
    console.log(req.user);
    const userId = req.user.user.id;
    console.log("user id is", userId);
    const currentDate = moment().format("YYYY-MM-DD");
    // const sqlSelect = "SELECT * FROM vocabs WHERE next_review <= ?";
    const sqlSelect = "SELECT * FROM vocabs WHERE next_review <= ? AND user_id = ?";
    db.query(sqlSelect, [currentDate, userId], (err, results) => {
      if (err) {
        console.error("Failed to fetch vocabularies due today:", err);
        return res.status(500).json({ message: "Failed to fetch vocabularies due today", error: err });
      }

      res.status(200).json(results);
    });
  });


app.get("/vocabs/:id", authorize, (req, res) => {
    const id = req.params.id;

    // Query to select a single vocabulary row from the vocabs table by ID
    const sqlSelect = "SELECT * FROM vocabs WHERE id = ?";

    db.query(sqlSelect, [id], (err, results) => {
        if (err) {
            console.error("Failed to fetch vocabulary:", err);
            return res.status(500).json({ message: "Failed to fetch vocabulary", error: err });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: "Vocabulary not found" });
        }

        // Send the fetched vocabulary row as a response
        res.status(200).json(results[0]);
    });
});

// Endpoint to update a vocabulary record
app.put("/vocabs/:id", authorize, (req, res) => {
    const vocabId = req.params.id;
    const userId = req.user.user.id; // Assuming `req.user.user.id` contains the user ID
    
    const { front, back, reviewed_at, next_review, box_id, status } = req.body;

    // Check if the user is authorized to update the record
    const sqlSelect = "SELECT user_id FROM vocabs WHERE id = ?";
    db.query(sqlSelect, [vocabId, userId], (err, results) => {
        if (err) {
            console.error("Error selecting vocabulary:", err);
            return res.status(500).json({ message: "Error selecting vocabulary", error: err });
        }

        if (results.length === 0 || results[0].user_id !== userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        // Perform the update operation in the database
        const sqlUpdate = "UPDATE vocabs SET front = ?, back = ?, reviewed_at = ?, next_review = ?, box_id = ?, status = ? WHERE id = ?";
        db.query(sqlUpdate, [front, back, reviewed_at, next_review, box_id, status, vocabId], (err, result) => {
            if (err) {
                console.error("Error updating vocabulary:", err);
                return res.status(500).json({ message: "Error updating vocabulary", error: err });
            }
            console.log("Vocabulary updated successfully");
            return res.status(200).json({ message: "Vocabulary updated successfully" });
        });
    });
});

app.post("/add-vocab", authorize, (req, res) => {
    const vocabList = Array.isArray(req.body) ? req.body.words : [req.body]; 
  const userId = req.user.user.id;
    vocabList.forEach((vocab) => {
        console.log(vocab);
      const { box_id, front, back, language, status, created_at, reviewed_at, next_review  } = vocab;
  
      const sqlInsert = "INSERT INTO vocabs (box_id, front, back, language, status, created_at, reviewed_at, next_review, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
  
     db.query(sqlInsert, [box_id, front, back, language, status, created_at, reviewed_at, next_review,userId], (err, result) => {
        if (err) {
          console.error("Failed to insert new vocab: ", err);
          return res.status(500).json({ message: "Failed to add vocab", error: err });
        }
  
        console.log("Vocab added successfully with ID: ", result.insertId);
      });
    });
    
    res.status(201).json({ message: "Vocabs added successfully" });
});
app.post("/add-vocab-array", authorize, (req, res) => {
    const vocabList = req.body.words;
    const userId = req.user.user.id;
    vocabList.forEach((vocab) => {
      const {box_id, front, back, language, status, created_at, reviewed_at, next_review} = vocab;
  
      const sqlInsert = "INSERT INTO vocabs (box_id, front, back, language, status, created_at, reviewed_at, next_review, user_id ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
  
      db.query(sqlInsert, [box_id, front, back, language, status, created_at, reviewed_at, next_review, userId], (err, result) => {
        if (err) {
          console.error("Failed to insert new vocab: ", err);
        } else {
          console.log("Vocab added successfully with ID: ", result.insertId);
        }
      });
    });
  
    res.status(201).json({ message: "Vocabs added successfully" });
  });
  
  

app.post ("/gpt-call",authorize, async(req, res) => {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        messages: [
          {content:`Generate ten new words in the ${req.body.language} language with its meaning in English. I want each new word separated from the meaning by ":" character.`, role: 'system'}],
        model: 'gpt-4',
        // max_tokens: 60,
        temperature: 0.5
      },{
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      })
       const content = response.data.choices[0].message.content;
    return res.json(content);
})


  

app.listen(3001, () => {
    console.log("Server started on port 3001");
});
