// Configuración de Firebase (usa los datos de tu proyecto)
const firebaseConfig = {
  apiKey: "AIzaSyBrVQDc84FBDDbqTEK_lkmjnU5uVU5V9bw",
  authDomain: "panel-coordenadas-22714.firebaseapp.com",
  projectId: "panel-coordenadas-22714",
  storageBucket: "panel-coordenadas-22714.appspot.com",
  messagingSenderId: "494351816189",
  appId: "1:494351816189:web:73221f86864cb97957b594"
};

// Inicializar Firebase con SDK clásico v8
firebase.initializeApp(firebaseConfig);

// Conexiones a servicios
const db = firebase.firestore();   // Base de datos Firestore
const auth = firebase.auth();      // Autenticación de usuarios
