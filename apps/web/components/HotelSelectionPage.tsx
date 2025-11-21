
import React, { useState } from 'react';
import { HotelEditModal } from './HotelEditModal';
import type { Hotel } from '../types';
import { ConfirmationModal } from './ConfirmationModal';

interface HotelSelectionPageProps {
  onSelectHotel: (hotel: Hotel) => void;
}

const initialHotels: Hotel[] = [
  { 
    id: 'org_1', name: 'Grand Palace Hotel', location: 'San Francisco, CA', 
    teams: [{name: 'Finance', email: 'finance.gph@example.com'}, {name: 'Front Desk', email: 'frontdesk.gph@example.com'}], 
    documents: [
      { id: 'doc_1_1', name: 'Standard Cancellation Policy', category: 'Cancellation Policy', fileName: 'gph_cancel_policy_2023.pdf', fileSize: 128000 },
      { id: 'doc_1_2', name: 'General Terms of Service', category: 'Terms of Service', fileName: 'gph_tos_v2.pdf', fileSize: 256000 },
    ],
    integrations: { psp: { type: 'stripe', status: 'connected'}, pms: { type: 'mews', status: 'connected'}},
    automationSettings: { autoSubmissionEnabled: true, autoSubmissionMinAmount: 50, autoMarkNotContested: true },
    users: [
        { id: 'user_001', name: 'Jamie Frontdesk', email: 'user1@gph.com', role: 'Staff', password: 'password123' }
    ]
  },
  { 
    id: 'org_2', name: 'Lakeside Resort & Spa', location: 'Lake Tahoe, NV', 
    teams: [{name: 'Reservations', email: 'res@lakeside.com'}], 
    documents: [],
    integrations: { psp: { type: 'adyen', status: 'connected'}, pms: { type: 'opera_cloud', status: 'connected'}},
    automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 100, autoMarkNotContested: false },
    users: [
        { id: 'user_002', name: 'Casey Manager', email: 'user2@lakeside.com', role: 'Manager', password: 'password123' }
    ]
  },
  { 
    id: 'org_3', name: 'Metropolis Business Inn', location: 'New York, NY', 
    teams: [{name: 'Front Desk', email: 'frontdesk.mbi@example.com'}, {name: 'Reservations', email: 'res.mbi@example.com'}], 
    documents: [],
    integrations: { psp: { type: 'stripe', status: 'connected'}, pms: { type: 'none', status: 'not_connected'}},
    automationSettings: { autoSubmissionEnabled: true, autoSubmissionMinAmount: 0, autoMarkNotContested: true },
    users: [
        { id: 'user_003', name: 'Taylor Finance', email: 'user3@mbi.com', role: 'Staff', password: 'password123' }
    ]
  },
];

export const HotelSelectionPage: React.FC<HotelSelectionPageProps> = ({ onSelectHotel }) => {
  const [hotels, setHotels] = useState<Hotel[]>(initialHotels);
  const [editingHotel, setEditingHotel] = useState<Hotel | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [hotelToRemove, setHotelToRemove] = useState<Hotel | null>(null);

  const confirmRemoveHotel = (e: React.MouseEvent, hotel: Hotel) => {
    e.stopPropagation();
    setHotelToRemove(hotel);
  };

  const handleRemoveHotel = () => {
    if (hotelToRemove) {
      setHotels(hotels.filter(h => h.id !== hotelToRemove.id));
      setHotelToRemove(null);
    }
  };

  const handleEditHotel = (e: React.MouseEvent, hotel: Hotel) => {
    e.stopPropagation();
    setEditingHotel(hotel);
    setIsEditModalOpen(true);
  };

  const handleAddNewHotel = () => {
    const newId = `org_${new Date().getTime()}`; 
    setEditingHotel({ 
        id: newId, 
        name: '', 
        location: '', 
        teams: [], 
        documents: [],
        integrations: { psp: { type: 'none', status: 'not_connected' }, pms: { type: 'none', status: 'not_connected' } },
        automationSettings: { autoSubmissionEnabled: false, autoSubmissionMinAmount: 100, autoMarkNotContested: false },
        users: []
    });
    setIsEditModalOpen(true);
  };

  const handleSaveHotel = (hotelToSave: Hotel) => {
    const index = hotels.findIndex(h => h.id === hotelToSave.id);
    if (index > -1) {
        const updatedHotels = [...hotels];
        updatedHotels[index] = hotelToSave;
        setHotels(updatedHotels);
    } else {
        setHotels([...hotels, hotelToSave]);
    }
    setIsEditModalOpen(false);
    setEditingHotel(null);
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setEditingHotel(null);
  };

  const IntegrationBadge: React.FC<{ type: string, status: string }> = ({ type, status }) => {
      if (type === 'none') return null;
      const isConnected = status === 'connected';
      return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${isConnected ? 'bg-green-900/20 text-green-400 border-green-900/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-400' : 'bg-slate-500'}`}></span>
              {type === 'opera_cloud' ? 'Opera Cloud' : type === 'opera_5' ? 'Opera 5' : type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
      )
  }

  return (
    <>
        <div className="md:flex md:items-center md:justify-between mb-10">
            <div className="flex-1 min-w-0">
                <h2 className="text-3xl font-bold leading-7 text-slate-50 sm:text-4xl sm:truncate font-heading tracking-tight">Properties</h2>
                <p className="mt-2 text-lg text-slate-400">Manage disputes and automation settings across your portfolio.</p>
            </div>
             <div className="mt-6 flex md:mt-0 md:ml-4">
                <button
                    onClick={handleAddNewHotel}
                    className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-xl shadow-lg shadow-cyan-500/20 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 focus:ring-offset-slate-950 transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add New Hotel
                </button>
             </div>
        </div>
        
          <div className="grid gap-8 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {hotels.map((hotel) => (
              <div
                  key={hotel.id}
                  onClick={() => onSelectHotel(hotel)}
                  className="group relative bg-slate-900/50 backdrop-blur-md rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition-all duration-300 ease-out cursor-pointer hover:shadow-2xl hover:shadow-cyan-900/10 overflow-hidden"
                  role="button"
                  tabIndex={0}
              >
                  {/* Card Top Color Bar */}
                  <div className="h-1.5 w-full bg-gradient-to-r from-slate-800 to-slate-700 group-hover:from-cyan-500 group-hover:to-blue-600 transition-all duration-500"></div>
                  
                  <div className="p-7">
                      <div className="flex justify-between items-start">
                         <div>
                             <h2 className="text-xl font-bold text-slate-100 group-hover:text-cyan-400 transition-colors font-heading">{hotel.name}</h2>
                             <div className="flex items-center mt-1 text-slate-400 group-hover:text-slate-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm">{hotel.location}</span>
                             </div>
                         </div>
                      </div>

                      <div className="mt-6 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Integrations</span>
                              <div className="flex gap-2">
                                  <IntegrationBadge type={hotel.integrations.psp.type} status={hotel.integrations.psp.status} />
                                  <IntegrationBadge type={hotel.integrations.pms.type} status={hotel.integrations.pms.status} />
                                  {hotel.integrations.psp.type === 'none' && hotel.integrations.pms.type === 'none' && <span className="text-slate-600 italic">None</span>}
                              </div>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Automation</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${hotel.automationSettings.autoSubmissionEnabled ? 'bg-cyan-900/20 text-cyan-300 border-cyan-900/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                  {hotel.automationSettings.autoSubmissionEnabled ? 'Auto-Submit On' : 'Auto-Submit Off'}
                              </span>
                          </div>
                      </div>
                  </div>
                  
                  <div className="px-7 py-4 bg-slate-950/30 border-t border-slate-800/50 flex justify-between items-center">
                      <button
                          onClick={(e) => handleEditHotel(e, hotel)}
                          className="text-xs font-semibold text-slate-400 hover:text-white uppercase tracking-wider transition-colors"
                      >
                          Settings
                      </button>
                      <button
                          onClick={(e) => confirmRemoveHotel(e, hotel)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                      </button>
                  </div>
              </div>
              ))}
          </div>

      {isEditModalOpen && editingHotel && (
        <HotelEditModal hotel={editingHotel} onSave={handleSaveHotel} onClose={handleCloseModal} />
      )}
      {hotelToRemove && (
        <ConfirmationModal 
          isOpen={!!hotelToRemove}
          onClose={() => setHotelToRemove(null)}
          onConfirm={handleRemoveHotel}
          title="Remove Hotel"
          message={`Are you sure you want to permanently remove "${hotelToRemove.name}"? This action cannot be undone.`}
          confirmButtonText="Remove"
          confirmButtonVariant="danger"
        />
      )}
    </>
  );
};