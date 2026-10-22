// Necessário para o build web: desativa a resolução via "exports" do package.json.
// Sem isso o Metro puxa o build ESM do zustand (devtools usa import.meta), que quebra
// o bundle web com "Cannot use 'import.meta' outside a module" (tela em branco).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

module.exports = config;
