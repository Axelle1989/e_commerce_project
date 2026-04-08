import React, { useState, useEffect, useRef } from 'react';
import { collection, doc, updateDoc, arrayUnion, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { ChatMessage, UserRole } from '../types';
import { Send, Image as ImageIcon, Loader2, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatProps {
  orderId: string;
  userRole: UserRole;
  messages: ChatMessage[];
}

export default function Chat({ orderId, userRole, messages }: ChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser) return;

    const message: ChatMessage = {
      senderId: auth.currentUser.uid,
      senderRole: userRole,
      text: newMessage.trim(),
      timestamp: new Date().toISOString(), // Use ISO string for immediate UI update, but server will handle it if we use serverTimestamp in arrayUnion
      type: 'text'
    };

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        chatMessages: arrayUnion({
          ...message,
          timestamp: new Date() // Firestore will store this as a timestamp
        })
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `orders/${orderId}/chat/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const message: ChatMessage = {
        senderId: auth.currentUser.uid,
        senderRole: userRole,
        text: '📷 Photo envoyée',
        timestamp: new Date(),
        type: 'image',
        imageUrl: url
      };

      await updateDoc(doc(db, 'orders', orderId), {
        chatMessages: arrayUnion(message)
      });
    } catch (error) {
      console.error('Error uploading chat image:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-benin-green rounded-xl flex items-center justify-center text-white">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-sm">Messagerie Directe</h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Commande #{orderId.slice(-4)}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-xs font-medium text-slate-500">Aucun message pour le moment.<br/>Commencez la discussion !</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.senderId === auth.currentUser?.uid;
            return (
              <div 
                key={i}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`p-4 rounded-2xl text-sm font-medium ${
                    isMe 
                      ? 'bg-benin-green text-white rounded-tr-none' 
                      : 'bg-slate-100 text-slate-900 rounded-tl-none'
                  }`}>
                    {msg.type === 'image' && msg.imageUrl && (
                      <img 
                        src={msg.imageUrl} 
                        alt="Chat" 
                        className="rounded-lg mb-2 max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(msg.imageUrl, '_blank')}
                      />
                    )}
                    <p>{msg.text}</p>
                  </div>
                  <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest px-1">
                    {msg.senderRole === 'driver' ? 'Livreur' : msg.senderRole === 'admin' ? 'Admin' : 'Client'} • {
                      msg.timestamp?.toDate 
                        ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
        <label className="p-3 bg-white text-slate-400 rounded-xl border border-slate-200 hover:text-benin-green hover:border-benin-green transition-all cursor-pointer">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
        </label>
        <input 
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Écrivez votre message..."
          className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-benin-green outline-none"
        />
        <button 
          type="submit"
          disabled={!newMessage.trim() || uploading}
          className="p-3 bg-benin-green text-white rounded-xl shadow-lg shadow-benin-green/20 hover:bg-benin-green/90 transition-all disabled:opacity-50 disabled:shadow-none"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
