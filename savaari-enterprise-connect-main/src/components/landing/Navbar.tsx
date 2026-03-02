import { useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import savaariLogo from "@/assets/savaari-logo.png";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "Solutions", href: "#solutions" },
    { label: "Why Savaari", href: "#value-props" },
    { label: "About", href: "#overview" },
    { label: "Contact", href: "#cta" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center">
          <img src={savaariLogo} alt="Savaari B2B CAB" className="h-9" />
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <a href="tel:09045450000" className="flex items-center gap-1.5 text-sm font-semibold text-primary mr-2">
            <Phone className="w-4 h-4" />
            0 90 4545 0000
          </a>
          <Button variant="outline" size="sm" className="text-sm font-medium border-primary text-primary hover:bg-primary hover:text-primary-foreground">
            Login
          </Button>
          <Button size="sm" className="gradient-cyan text-primary-foreground font-semibold shadow-cyan hover:opacity-90 transition-opacity border-0">
            Partner With Us
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-foreground"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden bg-background border-b border-border"
          >
            <div className="px-4 py-4 flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-muted-foreground hover:text-primary py-2"
                >
                  {link.label}
                </a>
              ))}
              <a href="tel:09045450000" className="flex items-center gap-1.5 text-sm font-semibold text-primary py-2">
                <Phone className="w-4 h-4" />
                0 90 4545 0000
              </a>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" size="sm" className="flex-1 border-primary text-primary">Login</Button>
                <Button size="sm" className="flex-1 gradient-cyan text-primary-foreground font-semibold border-0">
                  Partner With Us
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
