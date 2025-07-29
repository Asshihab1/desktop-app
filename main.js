const { app, BrowserWindow } = require("electron");
const path = require("path");
const express = require("express");
const fs = require("fs");

// Wait for Electron app to be ready before using app.getPath()
app.once("ready", () => {
  const userDataPath = app.getPath("userData");
  const uploadDir = path.join(userDataPath, "uploads");
  const downloadDir = path.join(userDataPath, "downloads");

  // Ensure necessary folders exist (recursive safe)
  try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
  } catch (err) {
    console.error("Failed to create folders:", err);
  }

  // Require upload after uploadDir is ready
  const upload = require("./tools/fileUpload")(uploadDir);
  const extractPdfText = require("./tools/pdfParser");
  const generateExcel = require("./generator/generateExcel");

  let mainWindow;

  // Create Express app
  const expressApp = express();
  const port = 3000;

  // Serve frontend files and downloads folder
  expressApp.use(express.static(path.join(__dirname, "public")));
  expressApp.use("/download", express.static(downloadDir));

  // PDF Upload Route
  expressApp.post("/upload", upload.array("file"), async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No PDF files uploaded." });
    }

    const results = [];

    for (const file of req.files) {
      const result = {
        file: file.originalname,
        success: false,
        error: null,
        tables: null,
      };

      try {
        console.log(`📄 Processing: ${file.originalname} => ${file.path}`);

        if (!file.mimetype.includes("pdf")) {
          result.error = "Only PDF files are allowed.";
          results.push(result);
          continue;
        }

        const parsed = await extractPdfText(file.path);
        if (parsed.success) {
          result.success = true;
          result.tables = parsed.tables;
        } else {
          result.error = parsed.error || "Failed to parse PDF.";
        }
      } catch (err) {
        console.error(`❌ Error processing file ${file.originalname}:`, err.message);
        result.error = err.message;
      }

      results.push(result);

      // Delete the uploaded temp file asynchronously and catch errors
      if (file?.path) {
        fs.unlink(file.path, (unlinkErr) => {
          if (unlinkErr) {
            console.warn(`⚠️ Failed to delete file: ${file.path}`, unlinkErr);
          }
        });
      }
    }

    try {
      const outputPath = path.join(downloadDir, "output.xlsx");
      await generateExcel(results, outputPath);

      res.status(200).json({
        message: "Excel exported successfully.",
        file: "output.xlsx",
        path: outputPath,
        result: results,
        success: true,
        downloadUrl: "/download/output.xlsx", // relative URL for download
      });
    } catch (genErr) {
      console.error("❌ Excel generation error:", genErr);
      res.status(500).json({
        error: "Failed to generate Excel file.",
        success: false,
      });
    }
  });

  // Root route
  expressApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
  });

  // Start Express server
  const server = expressApp.listen(port, () => {
    console.log(`🚀 Express server running at http://localhost:${port}`);
  });

  // Electron window
  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.loadURL(`http://localhost:${port}`);

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      server.close(); // Safely stop Express server
      app.quit();
    }
  });

  app.on("activate", () => {
    if (mainWindow === null) createWindow();
  });
});
