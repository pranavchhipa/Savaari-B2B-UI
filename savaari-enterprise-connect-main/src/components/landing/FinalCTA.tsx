import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const FinalCTA = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="cta" className="py-24 gradient-cyan relative overflow-hidden">
      {/* Accent orbs */}
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-primary-foreground/5 blur-[100px]" />
      <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full bg-primary-foreground/5 blur-[80px]" />

      <div className="container mx-auto px-4 lg:px-8 relative z-10" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-primary-foreground leading-tight mb-6">
            Ready to Transform Your Corporate Travel?
          </h2>
          <p className="text-lg text-primary-foreground/70 mb-10 max-w-xl mx-auto leading-relaxed">
            Join 500+ enterprises that trust Savaari B2B for safe, reliable, and
            transparent ground mobility across India.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-primary-foreground text-primary font-bold text-base hover:bg-primary-foreground/90 transition-opacity border-0 h-14 px-10">
              Create Free Account
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 font-semibold text-base h-14 px-10"
            >
              Schedule a Demo
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FinalCTA;
