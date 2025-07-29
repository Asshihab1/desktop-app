const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

/**
 * Generate Excel file with flattened product rows including PO, Vendor, Factory, and Style.
 * @param {Array} results - The JSON results array from PDF parsing
 * @param {string} outputPath - Where to save the generated Excel file
 */
async function generateExcel(results, outputPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("All Products");

  // Header
  sheet.columns = [
    { header: "PO", key: "po", width: 18 , style:{alignment:{ horizontal: "center"}}},
    // { header: "Vendor", key: "vendor", width: 25 },
    // { header: "Factory", key: "factory", width: 30 },
    { header: "Style", key: "style", width: 20 },
    { header: "Color", key: "color", width: 10 },
    { header: "Color Description", key: "color_description", width: 20 },
    { header: "Size", key: "size", width: 10 },
    { header: "UPC", key: "upc", width: 18 },
    { header: "Original Qty", key: "original_quantity", width: 15 },
    { header: "Current Qty", key: "current_quantity", width: 15 },
    { header: "Shipped Qty", key: "shipped_quantity", width: 15 },
    { header: "Unit Cost", key: "unit_cost", width: 12 },
    { header: "Total Cost", key: "total_cost", width: 15 },
  ];

  const allRows = [];

  for (const result of results) {
    if (!result.success || !result.tables) continue;

    const { purchase_order, product_rows } = result.tables;

    // Extract style from filename if available
    const styleMatch = result.file.match(/^\s*(\d{6,})/); // e.g., 112373023 from filename
    const style = styleMatch ? styleMatch[1] : "";

    for (const item of product_rows) {
      allRows.push({
        po: purchase_order.po,
        vendor: purchase_order.vendor,
        factory: purchase_order.factory,
        style,
        ...item,
      });
    }
  }


  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

  allRows.sort((a, b) => {
    if (a.po !== b.po) return a.po.localeCompare(b.po);
    const aIndex = sizeOrder.indexOf(a.size.toUpperCase());
    const bIndex = sizeOrder.indexOf(b.size.toUpperCase());
    if (aIndex === -1 || bIndex === -1) {
      return a.size.localeCompare(b.size); // fallback
    }
    return aIndex - bIndex;
  });

  // Add to sheet
  allRows.forEach((row) => sheet.addRow(row));

  // Header styling
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: "center" };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEEEEE" },
  };

  // Save
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Excel file saved to: ${outputPath}`);
}

module.exports = generateExcel;
