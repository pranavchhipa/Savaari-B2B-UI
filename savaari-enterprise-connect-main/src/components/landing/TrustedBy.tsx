import { motion } from "framer-motion";

const logos = [
  "Infosys", "Wipro", "TCS", "HCL", "Accenture", "Deloitte",
  "KPMG", "EY", "PwC", "Cognizant", "Tech Mahindra", "L&T",
];

const TrustedBy = () => {
  return (
    <section className="py-12 bg-secondary border-y border-border overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8 mb-6">
        <p className="text-center text-sm font-medium text-muted-foreground uppercase tracking-widest">
          Trusted by India's leading enterprises
        </p>
      </div>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-secondary to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-secondary to-transparent z-10" />
        <div className="flex animate-marquee">
          {[...logos, ...logos].map((name, i) => (
            <div
              key={i}
              className="flex-shrink-0 mx-8 flex items-center justify-center"
            >
              <span className="text-lg font-bold text-muted-foreground/40 tracking-wide whitespace-nowrap select-none">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustedBy;
