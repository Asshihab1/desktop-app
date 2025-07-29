const fs = require("fs");
const pdf2table = require("pdf2table");
const path = require("path");

async function waitForFileExists(filePath, maxRetries = 10, delay = 100) {
  for (let i = 0; i < maxRetries; i++) {
    if (fs.existsSync(filePath)) {
      try {
        fs.accessSync(filePath, fs.constants.R_OK);
        return true;
      } catch (e) {

      }
    }
    await new Promise((res) => setTimeout(res, delay));
  }
  return false;
}

const extractPdfText = async (pdfPath) => {
  try {
    const fileExists = await waitForFileExists(pdfPath);
    if (!fileExists) {
      return {
        success: false,
        error: `File not found or unreadable after retry: ${pdfPath}`,
      };
    }

    const buffer = fs.readFileSync(pdfPath);

    return await new Promise((resolve) => {
      pdf2table.parse(buffer, (err, rows) => {
        if (err || !Array.isArray(rows) || rows.length === 0) {
          return resolve({
            success: false,
            error: err?.message || "Failed to parse PDF using pdf2table",
          });
        }

        const cleanRows = rows.filter((row) =>
          row.some((cell) => (cell || "").trim() !== "")
        );

        const table1 = {}; // PO Info
        const table2 = {}; // Shipping Info
        const table3 = []; // Products

        for (let i = 0; i < cleanRows.length; i++) {
          const row = cleanRows[i];
          const rowStr = row.join(" ");

          // Table 1: Purchase Order Info
          if (!table1.po && rowStr.includes("PO:") && rowStr.includes("Factory:")) {
            const poMatch = rowStr.match(/PO:\s*(\d+)/);
            const factoryMatch = rowStr.match(/Factory:\s*(.+?)(?:Vendor:|$)/);
            const vendorMatch = rowStr.match(/Vendor:\s*(.+)/);

            table1.po = poMatch?.[1] || "";
            table1.factory = factoryMatch?.[1]?.trim() || "";
            table1.vendor = vendorMatch?.[1]?.trim() || "";
          }

          // Table 2: Shipping Info
          if (!table2.buyer && rowStr.includes("Buyer:")) {
            table2.buyer = cleanRows[i + 1]?.join(" ") || "";
            table2.vendor = cleanRows[i + 2]?.join(" ") || "";
            table2.shipping_destination = cleanRows[i + 3]?.join(" ") || "";
          }

          // Table 3: Product Rows
          if (row.length >= 9 && /^\d{13}$/.test(row[3])) {
            try {
              table3.push({
                color: row[0]?.trim(),
                color_description: row[1]?.trim(),
                size: row[2]?.trim(),
                upc: row[3],
                original_quantity: parseInt(row[4]) || 0,
                current_quantity: parseInt(row[5]) || 0,
                shipped_quantity: parseInt(row[6]) || 0,
                unit_cost: parseFloat(row[7].replace(/[$,]/g, "")) || 0,
                total_cost: parseFloat(row[8].replace(/[$,]/g, "")) || 0,
              });
            } catch (e) {
              // Skip malformed row
              continue;
            }
          }
        }

        resolve({
          success: true,
          tables: {
            purchase_order: table1,
            shipping_info: table2,
            product_rows: table3,
          },
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      error: error.message || "Unexpected error",
    };
  }
};

module.exports = extractPdfText;
