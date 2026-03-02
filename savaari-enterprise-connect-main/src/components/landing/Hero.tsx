import { motion } from "framer-motion";
import { ArrowRight, Shield, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroCar from "@/assets/hero-car.png";

const Hero = () => {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden pt-16">
      {/* Background image */}
      <div className="absolute inset-0">
        <img src={heroCar} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/30" />
      </div>

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-medium text-primary-foreground/80">
              Trusted by 500+ enterprises across India
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-primary-foreground leading-[1.1] tracking-tight mb-6"
          >
            Elevate Your Corporate{" "}
            <span className="text-gradient-cyan">Ground Travel</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg sm:text-xl text-primary-foreground/70 leading-relaxed mb-10 max-w-2xl"
          >
            India's largest vetted fleet across 2,000+ cities. Zero cancellations,
            GST-ready billing, and a dedicated account manager — all from one
            centralized dashboard.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 mb-16"
          >
            <Button size="lg" className="gradient-cyan text-primary-foreground font-bold text-base shadow-cyan hover:opacity-90 transition-opacity border-0 h-13 px-8">
              Create Free Account
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 font-semibold text-base h-13 px-8"
            >
              Talk to Sales
            </Button>
          </motion.div>

          {/* Mini stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap gap-8"
          >
            {[
              { icon: MapPin, label: "2,000+ Cities", sub: "Pan-India coverage" },
              { icon: Shield, label: "Zero Cancellations", sub: "Guaranteed rides" },
              { icon: Clock, label: "17+ Years", sub: "Industry expertise" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-cyan" />
                </div>
                <div>
                  <p className="font-semibold text-primary-foreground text-sm">{stat.label}</p>
                  <p className="text-xs text-primary-foreground/50">{stat.sub}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
