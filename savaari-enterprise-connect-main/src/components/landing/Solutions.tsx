import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Building2, Plane, Calendar, ArrowRight, CheckCircle2 } from "lucide-react";

const solutions = [
  {
    icon: Building2,
    title: "Corporate Travel",
    description:
      "End-to-end ground mobility for employee commutes, airport transfers, client meetings, and inter-city travel. Full cost control and compliance.",
    features: ["Employee ride management", "Airport transfers", "Policy enforcement"],
  },
  {
    icon: Plane,
    title: "Travel Agents",
    description:
      "White-label ground transport solutions for travel agencies. Offer your clients seamless cab bookings with premium fleet and competitive margins.",
    features: ["White-label integration", "Competitive pricing", "Bulk booking tools"],
  },
  {
    icon: Calendar,
    title: "Event Logistics (MICE)",
    description:
      "Large-scale transportation for conferences, offsites, and corporate events. Coordinate hundreds of rides with a single dashboard and dedicated coordinator.",
    features: ["Fleet coordination", "Real-time tracking", "Dedicated event manager"],
  },
];

const Solutions = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="solutions" className="py-24 bg-background">
      <div className="container mx-auto px-4 lg:px-8" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-4">
            Solutions
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-foreground leading-tight max-w-2xl mx-auto">
            Tailored for Every Business Need
          </h2>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-0 lg:gap-0 rounded-2xl overflow-hidden border border-border">
          {solutions.map((sol, i) => (
            <motion.div
              key={sol.title}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className={`group p-8 lg:p-10 bg-background hover:bg-secondary/50 transition-all duration-300 flex flex-col ${
                i < 2 ? "lg:border-r border-b lg:border-b-0 border-border" : ""
              }`}
            >
              <div className="w-14 h-14 rounded-xl bg-cyan-light flex items-center justify-center mb-6 group-hover:gradient-cyan transition-colors duration-300">
                <sol.icon className="w-7 h-7 text-primary group-hover:text-primary-foreground transition-colors duration-300" />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground mb-3">
                {sol.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">
                {sol.description}
              </p>
              <ul className="space-y-2.5 mb-6">
                {sol.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#cta"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-cyan-dark transition-colors group/link"
              >
                Learn more
                <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Solutions;
