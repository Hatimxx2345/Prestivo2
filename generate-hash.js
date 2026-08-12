// Génère un hash bcrypt pour un mot de passe admin.
// Usage : node generate-hash.js "MonNouveauMotDePasse"
const bcrypt = require("bcryptjs");

const password = process.argv[2];

if (!password) {
  console.log("Usage : node generate-hash.js \"MonMotDePasse\"");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log("\nColle cette ligne dans ton fichier .env :\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
