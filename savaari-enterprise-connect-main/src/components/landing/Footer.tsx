import savaariLogo from "@/assets/savaari-logo.png";

const Footer = () => {
  return (
    <footer className="gradient-cyan-dark text-primary-foreground">
      <div className="container mx-auto px-4 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
          {/* Company */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-primary-foreground mb-4">
              Company
            </h4>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <a href="#" className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors">
                About Us
              </a>
              <a href="#" className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors">
                Terms & Conditions
              </a>
            </div>
          </div>

          {/* Get in Touch */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-primary-foreground mb-4">
              Get in Touch
            </h4>
            <a href="#" className="text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors">
              Contact Us
            </a>
          </div>

          {/* Logo */}
          <div className="flex sm:justify-end items-start">
            <img src={savaariLogo} alt="Savaari B2B CAB" className="h-8 brightness-0 invert" />
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-primary-foreground/15 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-primary-foreground/50">
            © Copyright B2BCAB.
          </p>
          <p className="text-sm text-primary-foreground/50">
            Powered by Savaari Car Rentals Pvt Ltd.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
