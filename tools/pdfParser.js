const fs = require("fs");
const pdf2table = require("pdf2table");
const path = require("path");

async function waitForFileExists(filePath, maxRetries = 10, delay = 100) {
  for (let i = 0; i < maxRetries; i++) {
    if (fs.existsSync(filePath)) {
      try {
        fs.accessSync(filePath, fs.constants.R_OK);
        return true;
      } catch (e) { }
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
        if (err || !Array.isArray(rows)) {
          return resolve({
            success: false,
            error: err?.message || "Failed to parse PDF using pdf2table",
          });
        }

        // Improved row cleaning
        const cleanRows = rows
          .filter(row => row.some(cell => (cell || "").trim() !== ""))
          .map(row => row.map(cell => (cell || "").trim()));

        const table1 = {}; // PO Info
        const table2 = {}; // Shipping Info
        const table3 = []; // Products
        const tableMeta = {}; // Metadata

        // Helper function to find multi-line fields
        const findMultiLineField = (startRow, searchTerm, linesToCheck = 3) => {
          for (let i = startRow; i < Math.min(startRow + linesToCheck, cleanRows.length); i++) {
            const rowText = cleanRows[i].join(" ");
            if (rowText.includes(searchTerm)) {
              return rowText.split(searchTerm)[1]?.trim() ||
                cleanRows[i + 1]?.join(" ").trim() || "";
            }
          }
          return "";
        };

        for (let i = 0; i < cleanRows.length; i++) {
          const row = cleanRows[i];
          const rowStr = row.join(" ");

          // More flexible PO number detection
          if (!table1.po && /PO[:]?\s*\d+/i.test(rowStr)) {
            const poMatch = rowStr.match(/(?:PO|Purchase Order)[:\s]*(\d+)/i);
            table1.po = poMatch?.[1] || "";
          }

          // Improved shipping info extraction
          if (!table2.buyer && /buyer:/i.test(rowStr)) {
            table2.buyer = cleanRows[i + 1]?.join(" ") || "";
            table2.vendor = cleanRows[i + 2]?.join(" ") || "";
            table2.shipping_destination = cleanRows[i + 3]?.join(" ") || "";
          }

          // More robust style extraction
          if (!tableMeta.style && /style:/i.test(rowStr)) {
            tableMeta.style = rowStr.match(/style:\s*(\S+)/i)?.[1] || "";
            tableMeta.style_description = findMultiLineField(i, "Style Description:");
          }


          // brand desc started====================


          if (!tableMeta.brand_desc && /BRAND DESC:/i.test(rowStr)) {

            const currentLineMatch = rowStr.match(/BRAND DESC:\s*(.+?)(?:\s*(?:PRODUCT CATEGORY DESC|$))/i);
            if (currentLineMatch && currentLineMatch[1].trim()) {
              tableMeta.brand_desc = currentLineMatch[1].trim();
            }
            // Method 2: Get from next line if current line only contains label
            else if (rowStr.trim() === "BRAND DESC:" && i + 1 < cleanRows.length) {
              tableMeta.brand_desc = cleanRows[i + 1].join(" ").trim();
            }
            // Method 3: Look ahead in following lines
            else {
              for (let j = i + 1; j < Math.min(i + 3, cleanRows.length); j++) {
                const nextLine = cleanRows[j].join(" ").trim();
                if (nextLine && !nextLine.includes(":")) { // Skip lines with other labels
                  tableMeta.brand_desc = nextLine;
                  break;
                }
              }
            }

            // Only do minimal cleaning
            if (tableMeta.brand_desc) {
              tableMeta.brand_desc = tableMeta.brand_desc
                .replace(/\s+/g, ' ') // Collapse multiple spaces
                .trim();
            }
          }

          // Brand description with fallback


          // Commercial goods with better handling
          if (!tableMeta.commercial_goods && /COMMERCIAL GOODS/i.test(rowStr)) {
            tableMeta.commercial_goods = findMultiLineField(i, "COMMERCIAL GOODS");


          }

          // Dates extraction
          const extractDate = (fieldName) => {
            return rowStr.match(new RegExp(`${fieldName}\\s*(\\d{2}/\\d{2}/\\d{4})`))?.[1] || "";
          };

          if (!tableMeta.original_crd_date) {
            tableMeta.original_crd_date = extractDate("Original CRD Date:");
          }

          if (!tableMeta.original_in_dc_date) {
            tableMeta.original_in_dc_date = extractDate("Original In-DC Date:");
          }

          // Style proto with more flexible matching
          if (!tableMeta.style_proto && /STYLE PROTO #/i.test(rowStr)) {
            let styleProto = rowStr.split(/#[:]?\s*/i)[1]?.split(/\s/)[0] || "";

            if (styleProto === "HANGER") {
              tableMeta.style_proto = undefined;
            } else {
              tableMeta.style_proto = styleProto;
            }
          }

          // Improved product rows detection
          if (row.length >= 9) {
            const upc = row[3]?.replace(/\D/g, "");
            if (upc && upc.length >= 12) { // More flexible UPC check
              try {
                table3.push({
                  color: row[0] || "",
                  color_description: row[1] || "",
                  size: row[2] || "",
                  upc: upc,
                  original_quantity: parseInt(row[4]) || 0,
                  current_quantity: parseInt(row[5]) || 0,
                  shipped_quantity: parseInt(row[6]) || 0,
                  unit_cost: parseFloat(String(row[7] || "").replace(/[^\d.-]/g, "")) || 0,
                  total_cost: parseFloat(String(row[8] || "").replace(/[^\d.-]/g, "")) || 0,
                });
              } catch (e) {
                continue;
              }
            }
          }
          else if (row.length >= 8 && row[0]?.match(/^[A-Z]\d+/)) {

            try {
              table3.push({
                color: row[0] || "",
                color_description: row[1] || "",
                size: row[2] || "",
                upc: "",
                original_quantity: parseInt(row[3].replace(/\D/g, "")) || 0,
                current_quantity: parseInt(row[4].replace(/\D/g, "")) || 0,
                shipped_quantity: parseInt(row[5].replace(/\D/g, "")) || 0,
                unit_cost: parseFloat(String(row[6] || "").replace(/[^\d.-]/g, "")) || 0,
                total_cost: parseFloat(String(row[7] || "").replace(/[^\d.-]/g, "")) || 0,
              });
            } catch (e) {
              continue;
            }
          }


          else if (
            row.length === 5 &&
            row[0]?.match(/Total For Color:/) &&
            row[1]?.match(/\d+/) &&
            row[2]?.match(/\d+/) &&
            row[3]?.match(/\d+/) &&
            row[4]?.match(/[^\d.-]/)

          ) {
            try {
              const color = row[0].replace("Total For Color:", "").trim();
              table3.push({
                color: color,
                color_description: "", // You can’t extract this from this row
                size: "",
                upc: "",
                original_quantity: parseInt(row[1].replace(/\D/g, "")) || 0,
                current_quantity: parseInt(row[2].replace(/\D/g, "")) || 0,
                shipped_quantity: parseInt(row[3].replace(/\D/g, "")) || 0,
                unit_cost: 0, // Not available here
                total_cost: parseFloat(row[4].replace(/[^\d.-]/g, "")) || 0,
              });
            } catch (e) {
              continue;
            }
          }





          else {
            // console.log(row.length)
            console.log(row)
          }





        }

        resolve({
          success: true,
          tables: {
            purchase_order: table1,
            shipping_info: table2,
            product_rows: table3,
            metadata: tableMeta,
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