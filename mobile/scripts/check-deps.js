// Verifica se todos os imports têm dependências instaladas
const fs = require('fs');
const path = require('path');

// Lista de imports comuns que podem estar faltando
const criticalImports = {
  'react-native-reanimated': 'Animações',
  'react-native-toast-message': 'Notificações toast',
  'react-native-view-shot': 'Captura de tela',
  'expo-sharing': 'Compartilhamento',
  '@tanstack/react-query': 'Server state management',
  'zustand': 'Client state',
  'react-native-paper': 'UI components',
  'expo-router': 'Routing',
};

// Ler package.json
const packageJson = require('../package.json');
const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

// Verificar cada import crítico
console.log('🔍 Verificando dependências críticas...\n');
let hasErrors = false;

Object.entries(criticalImports).forEach(([lib, purpose]) => {
  if (!dependencies[lib]) {
    console.error(`❌ FALTANDO: ${lib} (${purpose})`);
    hasErrors = true;
  } else {
    console.log(`✅ ${lib} (${dependencies[lib]})`);
  }
});

if (hasErrors) {
  console.error('\n⚠️ Dependências faltando! Execute: npm install <biblioteca>');
  process.exit(1);
} else {
  console.log('\n✅ Todas as dependências críticas estão instaladas!');
}
