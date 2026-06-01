import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen w-screen bg-[#0d0d20] text-white flex items-center justify-center p-8"
      style={{ background: 'radial-gradient(ellipse at 50% 30%,rgba(71,118,230,0.12) 0%,#0d0d20 70%)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
        <div className="text-8xl mb-6 select-none">🤔</div>
        <h1 className="text-6xl font-black mb-2 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] bg-clip-text text-transparent">404</h1>
        <h2 className="text-2xl font-bold mb-3">Page Not Found</h2>
        <p className="text-white/40 mb-8">Looks like this page doesn't exist or was moved.</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate(-1)} variant="outline"
            className="gap-2 border-white/20 text-white hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" /> Go Back
          </Button>
          <Link to="/">
            <Button className="gap-2 bg-gradient-to-r from-[#4776e6] to-[#8b5cf6] text-white border-0 hover:opacity-90">
              <Home className="w-4 h-4" /> Home
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
