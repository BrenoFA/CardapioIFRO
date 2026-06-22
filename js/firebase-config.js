// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================
// IMPORTANTE: Substitua as chaves abaixo pelas suas credenciais
// do projeto Firebase. Acesse: https://console.firebase.google.com
// Crie um projeto > Adicionar app web > Copie as configurações.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBc1kVe4x-bFjr9lwJmmo7xUTFSWoRRke8",
  authDomain: "cardapio-ifro.firebaseapp.com",
  projectId: "cardapio-ifro",
  storageBucket: "cardapio-ifro.firebasestorage.app",
  messagingSenderId: "938798422313",
  appId: "1:938798422313:web:a298a82d0691329370bf38",
  measurementId: "G-YSYHNW3BZZ"
};

// Inicializa o Firebase (usando compat SDK carregado via CDN)
firebase.initializeApp(firebaseConfig);

// Instâncias globais
const auth = firebase.auth();
const db = firebase.firestore();

// Exporta para uso nos outros módulos
window.firebaseApp = { auth, db };

