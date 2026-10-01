/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.js", "./src/**/*.{js,jsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#18263c",
        navy: "#10213d",
        paper: "#f8f7f4",
        mist: "#eef2f8",
        line: "#e4e2dc",
        action: "#4168bc",
        muted: "#6f7a8b",
      },
      fontFamily: {
        serif: ["Georgia"],
      },
    },
  },
  plugins: [],
};
