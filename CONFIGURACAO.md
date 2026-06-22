# 🔥 Como Configurar o Firebase

O aplicativo usa o **Firebase** para banco de dados e autenticação. A configuração é gratuita para o volume de uso de uma escola.

---

## Passo 1 — Criar o Projeto Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Adicionar projeto"**
3. Dê um nome (ex: `cardapio-ifro`)
4. Clique em **Continuar** (pode desativar o Google Analytics)
5. Aguarde a criação

---

## Passo 2 — Registrar o App Web

1. Na página inicial do projeto, clique no ícone **`</>`** (Web)
2. Dê um apelido (ex: `cardapio-web`)
3. Clique em **"Registrar app"**
4. Você verá um bloco de código com `firebaseConfig`. **Copie ele** — vai ser parecido com isso:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "cardapio-ifro.firebaseapp.com",
  projectId: "cardapio-ifro",
  storageBucket: "cardapio-ifro.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

5. Abra o arquivo `js/firebase-config.js` e **substitua** as chaves de exemplo pelas suas

---

## Passo 3 — Ativar o Firestore

1. No menu lateral do Firebase, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Iniciar no modo de teste"** (por agora)
4. Selecione a região mais próxima (ex: `southamerica-east1` — São Paulo)
5. Clique em **"Concluído"**

> ⚠️ O modo de teste expira em 30 dias. Leia a seção "Regras de Segurança" abaixo.

---

## Passo 4 — Ativar o Authentication

1. No menu lateral, clique em **"Authentication"**
2. Clique em **"Primeiros passos"**
3. Na aba **"Sign-in method"**, habilite **"E-mail/senha"**
4. Clique em **"Salvar"**

---

## Passo 5 — Criar a Primeira Nutricionista

1. Ainda no Authentication, clique na aba **"Usuários"**
2. Clique em **"Adicionar usuário"**
3. Digite o email e senha da nutricionista
4. Clique em **"Adicionar usuário"**

> Depois de configurado, novas nutricionistas podem ser adicionadas direto pelo painel admin.

---

## Passo 6 — Regras de Segurança (IMPORTANTE)

Acesse **Firestore → Regras** e substitua pelo seguinte:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Leitura pública: alunos podem ver estados, campi e cardápios
    match /states/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /campi/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /menus/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Usuários: somente autenticados
    match /users/{id} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Clique em **"Publicar"**.

---

## Passo 7 — Executar o Aplicativo

Como o app usa Firebase pelo CDN, ele **não precisa de servidor Node.js**.

Basta abrir os arquivos em um servidor local simples. A forma mais fácil:

```powershell
# Instala o servidor (uma vez só)
npm install -g live-server

# Na pasta do projeto
cd "C:\Users\Breno\.gemini\antigravity-ide\scratch\school-menu"
live-server
```

Ou use a extensão **"Live Server"** do VS Code.

---

## Estrutura dos Dados no Firestore

```
📁 states/
   └── {id}: { name: "Rondônia", abbr: "RO" }

📁 campi/
   └── {id}: { name: "IFRO Campus Ariquemes", stateId: "..." }

📁 menus/
   ├── {campusId}_{year}_W{week}: {
   │     monday:    { morning_break: "...", lunch: "...", ... }
   │     tuesday:   { ... }
   │     ...
   │   }
   └── specific_{campusId}_{YYYY-MM-DD}: {
         morning_break: "...", lunch: "...", ...
       }

📁 users/
   └── {uid}: { email: "...", name: "...", role: "nutritionist" }
```

---

## Acesso Rápido

| Tela | URL |
|---|---|
| 🍽️ Cardápio (Alunos) | `index.html` |
| 🔒 Admin (Nutricionista) | `admin.html` |
