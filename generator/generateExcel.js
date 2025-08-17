const ExcelJS = require("exceljs");

async function generateExcel(results, outputPath) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("All Products");

    // Enhanced columns definition
    sheet.columns = [
      { header: "PO", key: "po", width: 18 },
      { header: "Style", key: "style", width: 15 },
      { header: "Style Description", key: "style_description", width: 30 },
      { header: "Brand", key: "brand_desc", width: 15 },
      { header: "Commercial Goods", key: "commercial_goods", width: 40 },
      { header: "Original CRD", key: "original_crd_date", width: 12 },
      { header: "Original In-DC", key: "original_in_dc_date", width: 12 },
      { header: "Style Proto", key: "style_proto", width: 15 },
      // { header: "Color", key: "color", width: 10 },
      { header: "Color Description", key: "color_description", width: 20 },
      { header: "Size", key: "size", width: 8 },
      { header: "UPC", key: "upc", width: 18 },
      { header: "Original Qty", key: "original_quantity", width: 12 },
      { header: "Current Qty", key: "current_quantity", width: 12 },
      { header: "Unit Cost", key: "unit_cost", width: 10 },
      { header: "Total Cost", key: "total_cost", width: 12 },
    ];

    const allRows = [];
    const errors = [];

    results.forEach((result, index) => {
      if (!result.success) {
        errors.push(`File ${index + 1}: ${result.error}`);
        return;
      }

      const { purchase_order, product_rows, metadata } = result.tables;

      if (!purchase_order?.po || !product_rows?.length) {
        errors.push(`File ${index + 1}: Missing required data`);
        return;
      }

      product_rows.forEach(item => {
        allRows.push({
          po: purchase_order.po || "N/A",
          style: metadata?.style || "",
          style_description: metadata?.style_description || "",
          brand_desc: metadata?.brand_desc || "",
          commercial_goods: metadata?.commercial_goods || "",
          original_crd_date: metadata?.original_crd_date || "",
          original_in_dc_date: metadata?.original_in_dc_date || "",
          style_proto: metadata?.style_proto || "",
          ...item
        });
      });
    });

    // Sort rows
    const sizeOrder = ["XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "4XL", "5XL"];

    allRows.sort((a, b) => {
      // First sort by PO
      const poCompare = (a.po || "").localeCompare(b.po || "");
      if (poCompare !== 0) return poCompare;

      // Then sort by size according to our predefined order
      const getSizeIndex = (size) => {
        const normalized = (size || "").toString().toUpperCase().trim()
          .replace(/^EXTRA\s+/i, 'X') // Convert "Extra Large" to "XL"
          .replace(/\s+/g, '');       // Remove all spaces

        return sizeOrder.findIndex(s => normalized === s.toUpperCase());
      };

      const aIndex = getSizeIndex(a.size);
      const bIndex = getSizeIndex(b.size);

      // Both sizes are in our predefined order
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;

      // Fallback to alphabetical if sizes aren't in our list
      return (a.size || "").toString().localeCompare((b.size || "").toString());
    });

    // Add data to sheet
    allRows.forEach(row => sheet.addRow(row));

    // Apply styling
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.font = { bold: true };
        row.alignment = { horizontal: "center" };
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEEEEEE" }
        };
      }


      if (rowNumber > 1) {
        ['unit_cost', 'total_cost', 'original_quantity', 'current_quantity'].forEach(key => {
          const cell = row.getCell(key);
          if (cell.value) cell.numFmt = '0.########'; // Pure numbers with up to 8 decimal places
        });
      }
    });

    // Freeze header row
    sheet.views = [{
      state: 'frozen',
      ySplit: 1
    }];

    // Auto-filter
    sheet.autoFilter = {
      from: 'A1',
      to: `${String.fromCharCode(65 + sheet.columns.length - 1)}1`
    };

    // Save with error reporting
    await workbook.xlsx.writeFile(outputPath);

    return {
      success: true,
      outputPath,
      processedFiles: results.filter(r => r.success).length,
      totalFiles: results.length,
      errors
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = generateExcel;