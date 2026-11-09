/* Builds data/products.json and data/prices.json from the combined MRP CSV.
 * Run: node tools/build-data.js [csvPath] [assetPackPath]
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var CSV_PATH = process.argv[2] || 'C:/Users/zahir/Downloads/MRP_Desk_V1_Combined_YBM_Sleepwell.csv';
var ASSET_ROOT = process.argv[3] || 'C:/Users/zahir/Downloads/MATTRESS_PRODUCT_ASSETS/MATTRESS_PRODUCT_ASSETS';

function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = '';
  var quoted = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i++; }
        else { quoted = false; }
      } else { field += ch; }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readDetails(folder) {
  var file = path.join(ASSET_ROOT, folder, 'product_details.md');
  if (!fs.existsSync(file)) return null;
  var lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  var section = '';
  var out = { description: '', features: [], highlights: [], series: '' };
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, '');
    if (line.indexOf('## ') === 0) {
      section = line.slice(3).toLowerCase();
      continue;
    }
    if (line.indexOf('- ') !== 0) continue;
    var value = line.slice(2).replace(/^\s+|\s+$/g, '');
    if (!value) continue;
    if (section.indexOf('product description') === 0) {
      if (!out.description) out.description = value;
    } else if (section.indexOf('features and benefits') === 0) {
      out.features.push(value);
    } else if (section.indexOf('key highlights') === 0) {
      out.highlights.push(value);
    } else if (section.indexOf('brand and series') === 0 && value.indexOf('Series:') === 0) {
      out.series = value.slice(7).replace(/^\s+|\s+$/g, '');
    }
  }
  return out;
}

var ASSET_BY_MODEL = {
  'Pro Latex Plus Royale': 'Pro_Latex_Plus_Royale',
  'Pro Spinetech Luxury': 'Pro_Spinetech_Luxury',
  'Pro Spinetech Premium': 'Pro_Spinetech_Premium',
  'Pro Spinetech Classic SE': 'Pro_Spinetech_Classic',
  'Springfresh Pocket Spring Premium SE': 'Springfresh_Pocket_Spring_Premium',
  'Springfresh Pocket Spring Classic SE': 'Springfresh_Pocket_Spring_Classic',
  'Nexa Plus Luxury SE': 'Nexa_Plus_Luxury',
  'Nexa Plus Premium': 'Nexa_Plus_Premium',
  'Durafirm Luxury': 'Durafirm_Luxury',
  'Durafirm Latex': 'Durafirm_Latex',
  'Durafirm Premium SE': 'Durafirm_Premium_Listing1_pp24-25',
  'Durafirm Premium (C) SE': 'Durafirm_Premium_Listing2_pp26-27',
  'Durafirm Classic SE': 'Durafirm_Classic_Listing1_pp28-29',
  'Durafirm Classic (C) SE': 'Durafirm_Classic_Listing2_pp30-31',
  'FitRest Plus Luxury': 'FitRest_Plus_Luxury',
  'FitRest Plus Premium SE': 'FitRest_Plus_Premium',
  'Utsav Comfort Premium S': 'Utsav_Comfort_Premium'
};

var csvText = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
var table = parseCsv(csvText).filter(function (r) { return r.length > 1; });
var head = table.shift();
var col = {};
head.forEach(function (name, i) { col[name.replace(/^\uFEFF/, '')] = i; });

var byKey = {};
var order = [];
var droppedNoThickness = 0;
var superseded = [];

table.forEach(function (r) {
  var brand = (r[col.brand] || '').replace(/^\s+|\s+$/g, '');
  var model = (r[col.model_name] || '').replace(/^\s+|\s+$/g, '');
  var thickness = parseFloat(r[col.thickness_inches]);
  var lengthIn = Math.round(parseFloat(r[col.length_cm]) / 2.54);
  var breadthIn = Math.round(parseFloat(r[col.breadth_cm]) / 2.54);
  var mrp = parseInt(r[col.mrp_inr], 10);
  if (!brand || !model || isNaN(mrp)) return;
  if (isNaN(thickness)) { droppedNoThickness++; return; }
  if (!(lengthIn > 0) || !(breadthIn > 0)) return;

  var key = brand + '|' + model + '|' + thickness + '|' + lengthIn + '|' + breadthIn;
  var record = {
    key: key,
    brand: brand,
    model: model,
    thickness: thickness,
    length: lengthIn,
    breadth: breadthIn,
    mrp: mrp,
    warranty: parseFloat(r[col.warranty_years]),
    effectiveFrom: r[col.effective_from],
    sourcePage: r[col.source_page]
  };
  if (byKey[key]) {
    // The YBM list prints 75x30 twice (once in the 72-series block and once in
    // the dedicated 75-series block). Keep the row from the dedicated series.
    superseded.push({ key: key, droppedMrp: byKey[key].mrp, keptMrp: mrp });
  } else {
    order.push(key);
  }
  byKey[key] = record;
});

var records = order.map(function (k) { return byKey[k]; });

var productMap = {};
var productList = [];
records.forEach(function (r) {
  var pid = (r.brand === 'Sleepwell' ? 'sw-' : 'ybm-') + slugify(r.model);
  if (!productMap[pid]) {
    var folder = ASSET_BY_MODEL[r.model];
    var details = folder ? readDetails(folder) : null;
    var image = folder && fs.existsSync(path.join(ASSET_ROOT, folder, 'images', 'main_product.jpg'))
      ? 'images/' + pid + '.jpg'
      : '';
    productMap[pid] = {
      id: pid,
      brand: r.brand,
      name: r.model,
      series: details ? details.series : '',
      warrantyYears: isNaN(r.warranty) ? null : r.warranty,
      description: details ? details.description : '',
      features: details ? details.features.slice(0, 8) : [],
      highlights: details ? details.highlights.slice(0, 4) : [],
      image: image
    };
    productList.push(productMap[pid]);
  } else if (!isNaN(r.warranty)) {
    productMap[pid].warrantyYears = r.warranty;
  }
});

productList.sort(function (a, b) {
  if (a.brand !== b.brand) return a.brand === 'Sleepwell' ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
});

var indexOfProduct = {};
productList.forEach(function (p, i) { indexOfProduct[p.id] = i; });

var prices = records.map(function (r) {
  var pid = (r.brand === 'Sleepwell' ? 'sw-' : 'ybm-') + slugify(r.model);
  return [indexOfProduct[pid], r.thickness, r.length, r.breadth, r.mrp];
}).sort(function (a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  if (a[2] !== b[2]) return a[2] - b[2];
  return a[3] - b[3];
});

var now = new Date();
var syncedAt = now.toISOString();
var effectiveDates = {};
var effectiveByBrand = {};
records.forEach(function (r) {
  if (!r.effectiveFrom) return;
  effectiveDates[r.effectiveFrom] = true;
  if (!effectiveByBrand[r.brand]) effectiveByBrand[r.brand] = r.effectiveFrom;
});

var productsFile = {
  syncedAt: syncedAt,
  source: path.basename(CSV_PATH),
  count: productList.length,
  products: productList
};
var pricesFile = {
  syncedAt: syncedAt,
  source: path.basename(CSV_PATH),
  effectiveFrom: Object.keys(effectiveDates).sort(),
  effectiveByBrand: effectiveByBrand,
  currency: 'INR',
  count: prices.length,
  supersededDuplicateRows: superseded.length,
  prices: prices
};

fs.writeFileSync(path.join(ROOT, 'data', 'products.json'), JSON.stringify(productsFile, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'data', 'prices.json'), JSON.stringify(pricesFile) + '\n');

var brands = {};
productList.forEach(function (p) { brands[p.brand] = (brands[p.brand] || 0) + 1; });
console.log('products:', productList.length, JSON.stringify(brands));
console.log('price records:', prices.length);
console.log('dropped (no thickness):', droppedNoThickness);
console.log('superseded duplicates:', superseded.length);
console.log('images mapped:', productList.filter(function (p) { return p.image; }).length);
console.log('effective dates:', pricesFile.effectiveFrom.join(', '));
