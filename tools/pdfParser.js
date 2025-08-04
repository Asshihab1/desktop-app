
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

        const cleanRows = rows
          .filter(row => row.some(cell => (cell || "").trim() !== ""))
          .map(row => row.map(cell => (cell || "").trim()));

        const table1 = {};
        const table2 = {};
        const table3 = [];
        const tableMeta = {};

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

          if (!table1.po && /PO[:]?\s*\d+/i.test(rowStr)) {
            const poMatch = rowStr.match(/(?:PO|Purchase Order)[:\s]*(\d+)/i);
            table1.po = poMatch?.[1] || "";
          }

          if (!table2.buyer && /buyer:/i.test(rowStr)) {
            table2.buyer = cleanRows[i + 1]?.join(" ") || "";
            table2.vendor = cleanRows[i + 2]?.join(" ") || "";
            table2.shipping_destination = cleanRows[i + 3]?.join(" ") || "";
          }

          if (!tableMeta.style && /style:/i.test(rowStr)) {
            tableMeta.style = rowStr.match(/style:\s*(\S+)/i)?.[1] || "";
            tableMeta.style_description = findMultiLineField(i, "Style Description:");
          }

          if (!tableMeta.brand_desc && /BRAND DESC:/i.test(rowStr)) {
            const currentLineMatch = rowStr.match(/BRAND DESC:\s*(.+?)(?:\s*(?:PRODUCT CATEGORY DESC|$))/i);
            if (currentLineMatch && currentLineMatch[1].trim()) {
              tableMeta.brand_desc = currentLineMatch[1].trim();
            } else if (rowStr.trim() === "BRAND DESC:" && i + 1 < cleanRows.length) {
              tableMeta.brand_desc = cleanRows[i + 1].join(" ").trim();
            } else {
              for (let j = i + 1; j < Math.min(i + 3, cleanRows.length); j++) {
                const nextLine = cleanRows[j].join(" ").trim();
                if (nextLine && !nextLine.includes(":")) {
                  tableMeta.brand_desc = nextLine;
                  break;
                }
              }
            }
            if (tableMeta.brand_desc) {
              tableMeta.brand_desc = tableMeta.brand_desc.replace(/\s+/g, ' ').trim();
            }
          }

          if (!tableMeta.commercial_goods && /COMMERCIAL GOODS/i.test(rowStr)) {
            tableMeta.commercial_goods = findMultiLineField(i, "COMMERCIAL GOODS");
          }

          const extractDate = (fieldName) => {
            return rowStr.match(new RegExp(`${fieldName}\\s*(\\d{2}/\\d{2}/\\d{4})`))?.[1] || "";
          };

          if (!tableMeta.original_crd_date) {
            tableMeta.original_crd_date = extractDate("Original CRD Date:");
          }

          if (!tableMeta.original_in_dc_date) {
            tableMeta.original_in_dc_date = extractDate("Original In-DC Date:");
          }

          if (!tableMeta.style_proto && /STYLE PROTO #/i.test(rowStr)) {
            let styleProto = rowStr.split(/#[:]?\s*/i)[1]?.split(/\s/)[0] || "";
            tableMeta.style_proto = (styleProto === "HANGER") ? undefined : styleProto;
          }

          const upc = row.find(cell => cell.replace(/\D/g, "").length >= 12);
          if (upc && row.length >= 7) {
            try {
              const upcIndex = row.indexOf(upc);
              table3.push({
                color: row[0] || "",
                color_description: row[1] || "",
                size: row[2] || "",
                upc: upc.replace(/\D/g, ""),
                original_quantity: parseInt(row[upcIndex + 1]) || 0,
                current_quantity: parseInt(row[upcIndex + 2]) || 0,
                shipped_quantity: parseInt(row[upcIndex + 3]) || 0,
                unit_cost: parseFloat((row[upcIndex + 4] || "").replace(/[^\d.-]/g, "")) || 0,
                total_cost: parseFloat((row[upcIndex + 5] || "").replace(/[^\d.-]/g, "")) || 0,
              });
            } catch (e) { }
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
