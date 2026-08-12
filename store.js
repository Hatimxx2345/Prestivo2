// Stockage simple des commandes dans un fichier JSON local.
// Suffisant pour le volume d'une boutique — pas besoin d'un vrai serveur de base de données.
// Les écritures sont mises en file d'attente pour éviter les collisions.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "orders.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

let writeQueue = Promise.resolve();
function writeAll(orders) {
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DATA_FILE, JSON.stringify(orders, null, 2), "utf-8", (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeQueue;
}

const VALID_STATUSES = ["nouveau", "contacte", "confirme", "annule"];

async function getAll({ status } = {}) {
  const orders = readAll();
  const filtered = status ? orders.filter((o) => o.status === status) : orders;
  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function create(order) {
  const orders = readAll();
  const entry = {
    id: order.id,
    lastname: order.lastname || "",
    firstname: order.firstname || "",
    phone: order.phone || "",
    city: order.city || "",
    email: order.email || "",
    product: order.product || "",
    status: "nouveau",
    createdAt: new Date().toISOString(),
  };
  orders.push(entry);
  await writeAll(orders);
  return entry;
}

async function updateStatus(id, status) {
  if (!VALID_STATUSES.includes(status)) return null;
  const orders = readAll();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  orders[idx].status = status;
  orders[idx].updatedAt = new Date().toISOString();
  await writeAll(orders);
  return orders[idx];
}

async function remove(id) {
  const orders = readAll();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return false;
  orders.splice(idx, 1);
  await writeAll(orders);
  return true;
}

async function stats() {
  const orders = readAll();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    total: orders.length,
    nouveau: orders.filter((o) => o.status === "nouveau").length,
    contacte: orders.filter((o) => o.status === "contacte").length,
    confirme: orders.filter((o) => o.status === "confirme").length,
    annule: orders.filter((o) => o.status === "annule").length,
    thisWeek: orders.filter((o) => new Date(o.createdAt) >= weekAgo).length,
  };
}

module.exports = { getAll, create, updateStatus, remove, stats, VALID_STATUSES };
