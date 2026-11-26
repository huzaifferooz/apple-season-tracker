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

const COLUMNS = {
  sales: ["id", "date", "season", "variety", "boxes", "rate", "buyer"],
  expenses: ["id", "date", "season", "category", "amount", "note"],
};

const config = window.APP_CONFIG || {};
let db = null;
let user; // undefined until the first auth check
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
const isSale = (r) => isBase(r) && isText(r.variety) && isText(r.buyer) && Number.isInteger(r.boxes) && isAmount(r.boxes) && isAmount(r.rate);
const isExpense = (r) => isBase(r) && isText(r.category) && isText(r.note) && isAmount(r.amount);

function parseData(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.sales) || !Array.isArray(d.expenses) ||
      !d.sales.every(isSale) || !d.expenses.every(isExpense)) {
    throw new Error("Not a valid backup file");
  }
  return { sales: d.sales, expenses: d.expenses };
}

/* ---------- cloud ---------- */
const pick = (type, record) => Object.fromEntries(COLUMNS[type].map((c) => [c, record[c]]));

function check({ data: rows, error }) {
  if (error) throw error;
  return rows;
}

async function fetchAll(type) {
  const all = [];
  for (let from = 0; ; from += 1000) { // the API returns at most 1000 rows per request
    const rows = check(await db.from(type).select(COLUMNS[type].join(",")).order("id").range(from, from + 999));
    all.push(...rows);
    if (rows.length < 1000) return all;
  }
}

async function upload(incoming, uid) {
  for (const type of Object.keys(COLUMNS)) {
    const rows = incoming[type].map((r) => ({ ...pick(type, r), user_id: uid }));
    for (let i = 0; i < rows.length; i += 500) {
      check(await db.from(type).upsert(rows.slice(i, i + 500), { onConflict: "user_id,id" }));
    }
  }
}

async function loadRecords() {
  const owner = user;
  $("app").hidden = true;
  $("retry").hidden = true;
  say("Loading your records...");
  try {
    const [sales, expenses] = await Promise.all([fetchAll("sales"), fetchAll("expenses")]);
    if (user !== owner) return;
    data = { sales, expenses };
    $("app").hidden = false;
    say("");
    render();
    showDeviceRecords();
    return true;
  } catch (e) {
    if (user !== owner) return;
    say("Could not load records: " + e.message, true);
    $("retry").hidden = false;
  }
}

/* records saved by the earlier version of this app, before login existed */
function deviceRecords() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? parseData(saved) : null;
  } catch (e) {
    return null;
  }
}

function showDeviceRecords() {
  const old = deviceRecords();
  const count = old ? old.sales.length + old.expenses.length : 0;
  $("uploadDevice").hidden = !count;
  $("uploadDevice").textContent = `Upload ${count} record(s) saved on this device`;
  if (count) say("Records from the old version were found. Upload them from the Backup tab.");
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
  delete form.dataset.pending;
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

async function remove(type, id) {
  if (!confirm("Delete this entry?")) return;
  const owner = user;
  try {
    const rows = check(await db.from(type).delete().eq("id", id).select("id"));
    if (user !== owner) return;
    if (!rows.length) throw new Error("Entry not found. Reload the page.");
    data[type] = data[type].filter((r) => r.id !== id);
    if (editing[type] === id) resetForm(type);
    say("Deleted.");
    render();
  } catch (e) {
    if (user === owner) say("Could not delete: " + e.message, true);
  }
}

async function submit(type, event) {
  event.preventDefault();
  const form = forms[type];
  const button = form.querySelector(".primary");
  if (button.disabled) return;
  const record = Object.fromEntries(new FormData(form));
  for (const key of ["boxes", "rate", "amount"]) {
    if (key in record) record[key] = Number(record[key]);
  }
  for (const key of ["variety", "buyer", "note"]) {
    if (key in record) record[key] = record[key].trim();
  }
  if (record.variety === "") return say("Enter a variety.", true);
  const owner = user;
  const old = data[type].find((r) => r.id === editing[type]);
  // a retry after a network error reuses the id, so nothing is added twice
  record.id = old ? old.id : (form.dataset.pending ||= newId());
  record.season = old ? old.season : season;

  button.disabled = true;
  say("Saving...");
  try {
    if (old) {
      const rows = check(await db.from(type).update(record).eq("id", record.id).select("id"));
      if (!rows.length) throw new Error("Entry not found. Reload the page.");
    } else {
      check(await db.from(type).upsert({ ...record, user_id: owner.id }, { onConflict: "user_id,id" }));
    }
    if (user !== owner) return;
    data[type] = [...data[type].filter((r) => r.id !== record.id), record];
    resetForm(type);
    say(old ? "Updated." : "Added.");
    render();
  } catch (e) {
    if (user === owner) say("Not saved: " + e.message, true);
  } finally {
    button.disabled = false;
  }
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
  e.target.value = "";
  if (!file) return;
  let incoming;
  try {
    incoming = parseData(await file.text());
  } catch (err) {
    return say("That file is not a valid backup.", true);
  }
  if (confirm("Add this backup to your account? Entries with the same ID are overwritten.")) await importRecords(incoming);
});

async function importRecords(incoming) {
  const owner = user;
  say("Uploading...");
  try {
    await upload(incoming, owner.id);
    if (user !== owner) return false;
    if (await loadRecords()) say("Records uploaded.");
    return true;
  } catch (e) {
    if (user === owner) say("Upload failed: " + e.message, true);
    return false;
  }
}

$("uploadDevice").addEventListener("click", async () => {
  const old = deviceRecords();
  if (!old || !confirm(`Upload these records to ${user.email}?`)) return;
  $("uploadDevice").disabled = true;
  if (await importRecords(old)) {
    try { // keep a copy, but never offer it to another account
      localStorage.setItem(KEY + "-uploaded", localStorage.getItem(KEY));
      localStorage.removeItem(KEY);
    } catch (_) { /* storage blocked */ }
    $("uploadDevice").hidden = true;
  }
  $("uploadDevice").disabled = false;
});

/* ---------- login ---------- */
function setUser(next) {
  if (user !== undefined && (user?.id ?? null) === (next?.id ?? null)) return;
  user = next;
  data = { sales: [], expenses: [] };
  season = new Date().getFullYear();
  resetForm("sales");
  resetForm("expenses");
  render();
  document.querySelector('nav [data-view="sales"]').click();
  $("auth").hidden = Boolean(user);
  $("account").hidden = !user;
  $("who").textContent = user ? user.email : "";
  $("app").hidden = true;
  $("retry").hidden = true;
  $("authForm").reset();
  say("");
  if (user) loadRecords();
}

async function authenticate(event) {
  event.preventDefault();
  const signingUp = event.submitter?.value === "signup";
  const f = $("authForm").elements;
  const credentials = { email: f.email.value.trim(), password: f.password.value };
  const buttons = $("authForm").querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  say(signingUp ? "Creating account..." : "Logging in...");
  try {
    if (signingUp) {
      const result = check(await db.auth.signUp({
        ...credentials, options: { emailRedirectTo: location.origin + location.pathname },
      }));
      if (!result.session) say("Check your email to confirm, then log in. If you already have an account, just log in.");
    } else {
      check(await db.auth.signInWithPassword(credentials));
    }
  } catch (e) {
    say(e.message, true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

function start() {
  if (!config.url || !config.key) return say("Setup needed: add your Supabase URL and key in config.js.", true);
  if (!window.supabase) return say("Could not load. Check your internet and reload.", true);
  try {
    db = window.supabase.createClient(config.url, config.key);
  } catch (e) {
    return say("Check config.js: " + e.message, true);
  }
  $("authForm").addEventListener("submit", authenticate);
  $("retry").addEventListener("click", loadRecords);
  $("logout").addEventListener("click", async () => {
    const { error } = await db.auth.signOut({ scope: "local" });
    if (error) say("Could not log out: " + error.message, true);
  });
  // deferred: calling Supabase inside this callback can lock up the client
  db.auth.onAuthStateChange((_event, session) => setTimeout(() => setUser(session?.user ?? null), 0));
}

resetForm("sales");
resetForm("expenses");
render();
start();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
