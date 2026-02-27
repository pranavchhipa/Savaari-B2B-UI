/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#0EA5E9", // Sky 500 - Deep Azure Blue-ish
                "primary-dark": "#0284C7", // Sky 600
                "background-light": "#F8FAFC", // Slate 50
                "background-dark": "#0F172A", // Slate 900
                "surface-light": "#FFFFFF",
                "surface-dark": "#1E293B", // Slate 800
            },
            fontFamily: {
                display: ["Inter", "sans-serif"],
                body: ["Inter", "sans-serif"],
            },
            borderRadius: {
                DEFAULT: "0.5rem",
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
        require('@tailwindcss/forms')
    ],
}
