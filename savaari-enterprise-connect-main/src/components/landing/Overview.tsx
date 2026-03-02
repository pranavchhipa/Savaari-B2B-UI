import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { TrendingUp, MapPin, Route, Users } from "lucide-react";

const stats = [
  { value: "17+", label: "Years of Experience", icon: TrendingUp },
  { value: "2,000+", label: "Cities Covered", icon: MapPin },
  { value: "5L+", label: "Routes Served", icon: Route },
  { value: "500+", label: "Enterprise Clients", icon: Users },
];

const Overview = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="overview" className="py-24 bg-background">
      <div className="container mx-auto px-4 lg:px-8" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left copy */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7 }}
          >
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-4">
              About Savaari B2B
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-foreground leading-tight mb-6">
              India's Most Trusted Corporate Ground Mobility Partner
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-6">
              With over 17 years of expertise, Savaari B2B operates the largest vetted fleet 
              in India. We eliminate the friction in corporate ground transport by ensuring 
              absolute safety, zero-cancellation guarantees, and uncompromising quality across 
              every ride.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              From Tier 1 metros to Tier 3 towns, our network spans 2,000+ cities and 5 lakh+ 
              routes — making us the single platform enterprises trust for seamless, compliant, 
              and reliable ground travel.
            </p>
          </motion.div>

          {/* Right - modern stat strips instead of cards */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="space-y-4"
          >
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, x: 30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-5 p-5 rounded-xl bg-secondary/60 border-l-4 border-primary hover:bg-secondary transition-colors duration-300"
              >
                <div className="w-12 h-12 rounded-lg gradient-cyan flex items-center justify-center flex-shrink-0">
                  <stat.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">
                    {stat.value}
                  </span>
                  <span className="block text-sm text-muted-foreground font-medium">
                    {stat.label}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Overview;
