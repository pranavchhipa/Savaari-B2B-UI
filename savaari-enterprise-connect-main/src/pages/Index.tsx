import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import TrustedBy from "@/components/landing/TrustedBy";
import Overview from "@/components/landing/Overview";
import ValuePropositions from "@/components/landing/ValuePropositions";
import Solutions from "@/components/landing/Solutions";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <TrustedBy />
      <Overview />
      <ValuePropositions />
      <Solutions />
      <FinalCTA />
      <Footer />
    </main>
  );
};

export default Index;
