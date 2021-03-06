const express = require("express");
const logger = require("morgan");
const mongoose = require("mongoose");
const path = require("path");

// Scraping tools
const axios = require("axios");
const cheerio = require("cheerio");

// Require all models
const db = require("./models");

const PORT = process.env.PORT ||3000;

// Initialize Express
const app = express();

// Configure middleware

// Use morgan logger for logging requests
app.use(logger("dev"));
// Parse request body as JSON
app.use(express.urlencoded({
    extended: true
}));
app.use(express.json());
// Make public a static folder
app.use(express.static("public"));

const DB_URI = process.env.DB_URI || "mongodb://localhost/onion";

// Connect to the Mongo DB
mongoose.connect(DB_URI, {
    useNewUrlParser: true
});

// Avoiding deprecation warnings https://mongoosejs.com/docs/deprecations.html#-findandmodify-
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

// Routes

// A GET route for the main site
app.get("/", function (req, res) {
    res.sendFile('./index.html')
});

app.get("/saved", function (req, res) {
    console.log("getting saved")
    res.sendFile(path.join(__dirname + '/public/saved.html'));
});

// A GET route for scraping the onion website
app.get("/scrape", function (req, res) {
    // First, we grab the body of the html with axios
    axios.get("http://www.theonion.com/").then(function (response) {
        // Then, we load that into cheerio and save it to $ for a shorthand selector
        const $ = cheerio.load(response.data);

        const uniqueLinks = [];
        // Now, we grab every h2 within an article tag, and do the following:
        $(".content-meta__headline__wrapper").find("a").each(function (i, element) {
            // Save an empty result object

            console.log(i);

            const result = {};
            const title = $(element).attr("title");
            const link = $(element).attr("href");

            if (uniqueLinks.includes(link)) {
                return;
            } else {
                uniqueLinks.push(link);
                if (title === undefined) {
                    return;
                } else {
                    result.title = title;
                    result.link = link;
                    result.isSaved = false;
                };
            };

            // Create a new Article using the `result` object built from scraping
            db.Article.create(result)
                .then(function (dbArticle) {
                    // View the added result in the console
                    console.log(dbArticle);
                    res.json("article added")
                })
                .catch(function (err) {
                    // If an error occurred, log it
                    console.log(err);
                    res.json("article was a duplicate")
                });
        });

    });
});

app.get("/articles", function (req, res) {
    // Grab every document in the Articles collection
    db.Article.find({})
        .then(function (dbArticles) {
            // If we were able to successfully find Articles, send them back to the client
            res.json(dbArticles);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
})

// Route for grabbing a specific Article by id, populate it with its note
app.get("/articles/:id", function (req, res) {
    // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
    db.Article.findOne({
            _id: req.params.id
        })
        // ..and populate all of the notes associated with it
        .populate("note")
        .then(function (dbArticle) {
            // If we were able to successfully find an Article with the given id, send it back to the client
            console.log("sending back specific article")
            console.log("note object", dbArticle.note)
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});

// Route for saving/updating an Article's associated Note
app.post("/articles/:id", function (req, res) {
    // Create a new note and pass the req.body to the entry
    console.log("creating new note for ", req.params.id)
    console.log(req.body.note);
    db.Note.create(req.body)
        .then(function (dbNote) {
            // If a Note was created successfully, find one Article with an `_id` equal to `req.params.id`. Update the Article to be associated with the new Note
            // { new: true } tells the query that we want it to return the updated User -- it returns the original by default
            // Since our mongoose query returns a promise, we can chain another `.then` which receives the result of the query
            return db.Article.findOneAndUpdate({
                _id: req.params.id
            }, {
                note: dbNote._id
            }, {
                new: true
            });
        })
        .then(function (dbArticle) {
            // If we were able to successfully update an Article, send it back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            console.log(err);
            res.json(err);
        });
});

app.put("/articles/:id", function (req, res) {
    db.Article.findOneAndUpdate({
            _id: req.params.id
        }, {
            isSaved: req.body.isSaved
        }, {
            new: true
        })
        .then(function (dbArticle) {
            // If we were able to successfully update an Article, send it back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});

app.delete("/articles/:id", function (req, res) {
    console.log("deleting article");
    db.Article.findByIdAndDelete({
        _id: req.params.id
    }, function (err) {
        if (!err) {
            res.json("article successfully deleted");
            console.log("article successfully deleted");
        } else {
            console.log(err);
        }
    });
});

// Start the server
app.listen(PORT, function () {
    console.log("App running on port " + PORT + "!");
});