/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        night: "#09050f",
        plasma: "#f238ff",
        cyber: "#56ff9f",
        spark: "#9f5cff",
        neonBlue: "#45d8ff",
        ink: "#100a1c"
      },
      fontFamily: {
        display: ["'Bungee'", "cursive"],
        body: ["'Space Grotesk'", "sans-serif"]
      },
      boxShadow: {
        glowPink: "0 0 30px rgba(242,56,255,0.45)",
        glowLime: "0 0 28px rgba(86,255,159,0.35)",
        card: "0 16px 40px rgba(0,0,0,0.45)"
      }
    }
  },
  plugins: []
};