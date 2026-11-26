"use strict";

const KEY = "apple-season-tracker-v1";
const CATEGORIES = ["Sprays", "Fertiliser", "Labour", "Packaging", "Transport", "Commission", "Irrigation", "Other"];
const $ = (id) => document.getElementById(id);
const money = (n) => (n < 0 ? "-₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const round = (n) => Math.round(n * 100) / 100;
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

let data = { sales: [], expenses: [] };
let season = new Date().getFullYear();
const editing = { sales: null, expenses: null };

function say(text, isError = false) {
  $("message").textContent = text;
  $("message").className = isError ? "error" : "";
}

/* ---------- storage ---------- */
const isText = (v) => typeof v === "string";
const isAmount = (v) => Number.isFinite(v) && v > 0;
const isBase = (r) => r && isText(r.id) && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isInteger(r.season);
const isSale = (r) => isBase(r) && isText(r.variety) && isText(r.buyer) && isAmount(r.boxes) && isAmount(r.rate);
const isExpense = (r) => isBase(r) && isText(r.category) && isText(r.note) && isAmount(r.amount);

function parseData(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.sales) || !Array.isArray(d.expenses) ||
      !d.sales.every(isSale) || !d.expenses.every(isExpense)) {
    throw new Error("Not a valid backup file");
  }
  return { sales: d.sales, expenses: d.expenses };
}

function load() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
    if (saved) data = parseData(saved);
  } catch (e) {
    // keep a copy of unreadable data so the next save cannot destroy it
    try { if (saved) localStorage.setItem(KEY + "-damaged", saved); } catch (_) { /* storage blocked */ }
    say("Saved records could not be read.", true);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    say("Could not save on this device. Download a backup now.", true);
    return false;
  }
}

/* ---------- rendering ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const inSeason = (list) => list.filter((r) => r.season === season).sort((a, b) => b.date.localeCompare(a.date));
const saleTotal = (s) => round(s.boxes * s.rate);
const sum = (list, value) => round(list.reduce((t, r) => t + value(r), 0));

function renderSeasons() {
  const now = new Date().getFullYear();
  const years = new Set([now + 1, now, now - 1, season, ...data.sales.map((r) => r.season), ...data.expenses.map((r) => r.season)]);
  $("season").replaceChildren(...[...years].sort((a, b) => b - a).map((y) => new Option(y, y, false, y === season)));
}

function renderList(type, listId, describe) {
  const rows = inSeason(data[type]);
  const items = rows.map((r) => {
    const { title, value, meta } = describe(r);
    const li = el("li");
    const row = el("div", "row");
    row.append(el("span", "", title), el("span", "", value));
    const actions = el("div", "actions");
    for (const [label, fn] of [["Edit", startEdit], ["Delete", remove]]) {
      const button = el("button", "", label);
      button.type = "button";
      button.addEventListener("click", () => fn(type, r.id));
      actions.append(button);
    }
    li.append(row, el("div", "meta", meta), actions);
    return li;
  });
  $(listId).replaceChildren(...(items.length ? items : [el("li", "empty", "No entries for this season yet.")]));
}

function renderBars(id, rows, key, value, detail) {
  const groups = new Map();
  for (const r of rows) {
    const name = r[key].trim();
    const g = groups.get(name.toLowerCase()) || { name, total: 0, boxes: 0 };
    g.total += value(r);
    g.boxes += r.boxes || 0;
    groups.set(name.toLowerCase(), g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
  const nodes = sorted.map((g) => {
    const bar = el("div", "bar");
    const row = el("div", "row");
    row.append(el("span", "", g.name), el("span", "", money(round(g.total))));
    const track = el("div", "track");
    const fill = el("i");
    fill.style.width = (g.total / sorted[0].total) * 100 + "%";
    track.append(fill);
    bar.append(row, track);
    if (detail) bar.append(el("div", "meta", detail(g)));
    return bar;
  });
  $(id).replaceChildren(...(nodes.length ? nodes : [el("p", "empty", "Nothing to show yet.")]));
}

function render() {
  renderSeasons();
  const sales = inSeason(data.sales);
  const expenses = inSeason(data.expenses);
  const revenue = sum(sales, saleTotal);
  const spent = sum(expenses, (r) => r.amount);
  const boxes = sum(sales, (r) => r.boxes);
  const profit = round(revenue - spent);

  $("profitLabel").textContent = profit < 0 ? "Loss" : "Profit";
  $("profit").textContent = money(profit);
  $("profit").classList.toggle("loss", profit < 0);
  $("revenue").textContent = money(revenue);
  $("spent").textContent = money(spent);
  $("boxes").textContent = boxes.toLocaleString("en-IN");
  $("average").textContent = money(boxes ? round(revenue / boxes) : 0);

  renderList("sales", "saleList", (r) => ({
    title: r.variety, value: money(saleTotal(r)),
    meta: [r.date, `${r.boxes} boxes × ${money(r.rate)}`, r.buyer].filter(Boolean).join(" · "),
  }));
  renderList("expenses", "expenseList", (r) => ({
    title: r.category, value: money(r.amount), meta: [r.date, r.note].filter(Boolean).join(" · "),
  }));
  renderBars("byVariety", sales, "variety", saleTotal, (g) => `${g.boxes} boxes · avg ${money(round(g.total / g.boxes))}`);
  renderBars("byCategory", expenses, "category", (r) => r.amount);
}

/* ---------- forms ---------- */
const forms = { sales: $("saleForm"), expenses: $("expenseForm") };
const addLabels = { sales: "Add sale", expenses: "Add expense" };

function resetForm(type) {
  const form = forms[type];
  editing[type] = null;
  form.reset();
  form.elements.date.value = today();
  form.querySelector(".primary").textContent = addLabels[type];
  form.querySelector(".cancel").hidden = true;
  if (type === "sales") preview();
}

function startEdit(type, id) {
  const record = data[type].find((r) => r.id === id);
  const form = forms[type];
  editing[type] = id;
  for (const field of form.elements) {
    if (field.name) field.value = record[field.name];
  }
  form.querySelector(".primary").textContent = "Save changes";
  form.querySelector(".cancel").hidden = false;
  if (type === "sales") preview();
  form.scrollIntoView({ behavior: "smooth" });
}

function remove(type, id) {
  if (!confirm("Delete this entry?")) return;
  data[type] = data[type].filter((r) => r.id !== id);
  if (editing[type] === id) resetForm(type);
  if (save()) say("Deleted.");
  render();
}

function submit(type, event) {
  event.preventDefault();
  const record = Object.fromEntries(new FormData(forms[type]));
  for (const key of ["boxes", "rate", "amount"]) {
    if (key in record) record[key] = Number(record[key]);
  }
  for (const key of ["variety", "buyer", "note"]) {
    if (key in record) record[key] = record[key].trim();
  }
  if (record.variety === "") return say("Enter a variety.", true);
  const old = data[type].find((r) => r.id === editing[type]);
  record.id = old ? old.id : newId();
  record.season = old ? old.season : season;
  if (old) data[type][data[type].indexOf(old)] = record;
  else data[type].push(record);
  resetForm(type);
  if (save()) say(old ? "Updated." : "Added.");
  render();
}

function preview() {
  const f = forms.sales.elements;
  $("salePreview").textContent = "Total: " + money(round(Number(f.boxes.value) * Number(f.rate.value)));
}

/* ---------- backup ---------- */
function download(name, content, type) {
  const link = el("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; // stop spreadsheet formulas
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv() {
  const rows = [["Type", "Date", "Variety / Category", "Boxes", "Rate", "Amount", "Buyer / Note"]];
  for (const r of inSeason(data.sales)) rows.push(["Sale", r.date, r.variety, r.boxes, r.rate, saleTotal(r), r.buyer]);
  for (const r of inSeason(data.expenses)) rows.push(["Expense", r.date, r.category, "", "", r.amount, r.note]);
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/* ---------- start ---------- */
forms.expenses.elements.category.replaceChildren(...CATEGORIES.map((c) => new Option(c, c)));
for (const type of Object.keys(forms)) {
  forms[type].addEventListener("submit", (e) => submit(type, e));
  forms[type].querySelector(".cancel").addEventListener("click", () => resetForm(type));
}
forms.sales.addEventListener("input", preview);

document.querySelector("nav").addEventListener("click", (e) => {
  const view = e.target.dataset.view;
  if (!view) return;
  for (const b of document.querySelectorAll("nav button")) b.classList.toggle("active", b === e.target);
  for (const s of document.querySelectorAll(".view")) s.hidden = s.id !== view;
  say("");
});

$("season").addEventListener("change", (e) => {
  season = Number(e.target.value);
  resetForm("sales");
  resetForm("expenses");
  render();
});

$("exportJson").addEventListener("click", () =>
  download(`apple-backup-${today()}.json`, JSON.stringify(data, null, 2), "application/json"));
$("exportCsv").addEventListener("click", () => download(`apple-season-${season}.csv`, toCsv(), "text/csv"));
$("importJson").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const incoming = parseData(await file.text());
    if (confirm("Replace all current records with this backup?")) {
      data = incoming;
      resetForm("sales");
      resetForm("expenses");
      if (save()) say("Backup restored.");
      render();
    }
  } catch (err) {
    say("That file is not a valid backup.", true);
  }
  e.target.value = "";
});

load();
resetForm("sales");
resetForm("expenses");
render();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
