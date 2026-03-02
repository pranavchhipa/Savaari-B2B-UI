import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Globe, LayoutDashboard, FileText, Car, Headphones } from "lucide-react";

const props = [
  {
    icon: Globe,
    title: "Limitless Pan-India Presence",
    description:
      "Immediate access to top-tier cabs across Tier 1, 2, and 3 cities. One platform for all your ground transport needs — anywhere in India.",
    highlight: "2,000+ cities",
  },
  {
    icon: LayoutDashboard,
    title: "Centralized Corporate Dashboard",
    description:
      "A single platform to book, track, and manage all employee rides. Set departmental limits, control workflows, and get real-time visibility.",
    highlight: "One dashboard",
  },
  {
    icon: FileText,
    title: "Transparent, GST-Ready Billing",
    description:
      "100% compliant monthly billing with easy input tax credit claims. Zero hidden surges, no surprises — just clean, auditable invoices.",
    highlight: "100% compliant",
  },
  {
    icon: Car,
    title: "Executive-Grade Fleet & Chauffeurs",
    description:
      "Premium sedans and SUVs with background-verified, courteous drivers trained in corporate etiquette. Every ride reflects your brand.",
    highlight: "Premium fleet",
  },
  {
    icon: Headphones,
    title: "24/7 Dedicated Account Manager",
    description:
      "Priority support and a single point of contact for instant issue resolution. Your dedicated manager ensures nothing falls through the cracks.",
    highlight: "24/7 support",
  },
];

const ValuePropositions = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="value-props" className="py-24 gradient-cyan-dark">
      <div className="container mx-auto px-4 lg:px-8" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-cyan-light mb-4">
            Why Choose Savaari B2B
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-primary-foreground leading-tight max-w-2xl mx-auto">
            Everything Your Enterprise Needs for Ground Mobility
          </h2>
        </motion.div>

        {/* Modern alternating layout instead of cards */}
        <div className="space-y-6">
          {props.map((prop, i) => (
            <motion.div
              key={prop.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6 sm:p-8 rounded-2xl bg-primary-foreground/[0.04] border border-primary-foreground/[0.08] hover:bg-primary-foreground/[0.08] transition-all duration-300 group"
            >
              <div className="w-14 h-14 rounded-xl gradient-cyan flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                <prop.icon className="w-7 h-7 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="font-display font-bold text-lg text-primary-foreground">
                    {prop.title}
                  </h3>
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/30 text-cyan-light">
                    {prop.highlight}
                  </span>
                </div>
                <p className="text-primary-foreground/60 text-sm leading-relaxed max-w-2xl">
                  {prop.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ValuePropositions;
