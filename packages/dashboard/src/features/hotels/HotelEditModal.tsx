
import React, { useState, useEffect, useRef } from 'react';
import type { Hotel, Team, HotelDocument, DocumentCategory, AutomationSettings, HotelUser } from '@realyn/shared';
import { ErrorBoundary, useAuth } from '@realyn/shared';
import { IntegrationsTab } from './IntegrationsTab';
import type { PspCredentials, OperaCloudCredentials } from './IntegrationsTab';

interface HotelEditModalProps {
  hotel: Hotel;
  onSave: (hotel: Hotel, mewsCredentials?: { apiKey: string; accessToken: string; propertyId: string }, pspCredentials?: PspCredentials, operaCloudCredentials?: OperaCloudCredentials) => void;
  onClose: () => void;
}

const documentCategories: DocumentCategory[] = ['Cancellation Policy', 'Terms of Service', 'House Rules', 'Other'];
type EditTab = 'details' | 'users' | 'integrations' | 'automation';

const inputBaseStyle = "block w-full text-sm rounded-lg bg-slate-800 border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600";
const darkTextInputStyle = `${inputBaseStyle} px-3 py-2`;
const darkSelectStyle = `${inputBaseStyle} pl-3 pr-10 py-2`;
const darkPrimaryBtnStyle = "inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed";
const lightSecondaryBtnStyle = "inline-flex justify-center items-center px-4 py-2 border border-slate-700 shadow-sm text-sm font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed";

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            active ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-800'
        }`}
    >
        {children}
    </button>
);


const DetailsTab: React.FC<{ formData: Hotel; setFormData: React.Dispatch<React.SetStateAction<Hotel>>; formErrors: { [key: string]: string }; }> = ({ formData, setFormData, formErrors }) => {
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamEmail, setNewTeamEmail] = useState('');
    const [teamErrors, setTeamErrors] = useState<{ name?: string; email?: string }>({});
    const [newDocName, setNewDocName] = useState('');
    const [newDocCategory, setNewDocCategory] = useState<DocumentCategory>('Other');
    const [newDocFile, setNewDocFile] = useState<File | null>(null);

     const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const handleAddTeam = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const errors: { name?: string; email?: string } = {};
        if (!newTeamName) errors.name = 'Name is required.';
        if (!newTeamEmail) errors.email = 'Email is required.';
        else if (!validateEmail(newTeamEmail)) errors.email = 'Invalid email address.';

        setTeamErrors(errors);

        if (Object.keys(errors).length === 0) {
            const newTeam: Team = { name: newTeamName, email: newTeamEmail };
            setFormData(prev => ({ ...prev, teams: [...prev.teams, newTeam] }));
            setNewTeamName('');
            setNewTeamEmail('');
            setTeamErrors({});
        }
    };
    
    const handleRemoveTeam = (index: number) => {
        setFormData(prev => ({ ...prev, teams: prev.teams.filter((_, i) => i !== index) }));
    };

    const handleAddDocument = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (newDocName && newDocFile) {
            const newDocument: HotelDocument = {
                id: `doc_${new Date().getTime()}`, name: newDocName, category: newDocCategory,
                fileName: newDocFile.name, fileSize: newDocFile.size,
            };
            setFormData(prev => ({ ...prev, documents: [...prev.documents, newDocument] }));
            setNewDocName('');
            setNewDocCategory('Other');
            setNewDocFile(null);
            const fileInput = document.getElementById('document-file') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
        }
    }

    const handleRemoveDocument = (id: string) => {
        setFormData(prev => ({ ...prev, documents: prev.documents.filter(doc => doc.id !== id) }));
    };

    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-400">Hotel Name</label>
                    <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} className={`mt-1 ${darkTextInputStyle} ${formErrors.name ? 'border-red-500' : ''}`} />
                    {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
                </div>
                <div>
                    <label htmlFor="location" className="block text-sm font-medium text-slate-400">Location</label>
                    <input type="text" name="location" id="location" value={formData.location} onChange={handleChange} className={`mt-1 ${darkTextInputStyle}`} />
                </div>
            </div>

            <div className="pt-6 border-t border-slate-800">
                <h4 className="text-lg font-medium text-slate-50 font-heading">Teams</h4>
                 <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-2">
                    {formData.teams.map((team, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                        <div className="flex-1 min-w-0 mr-4">
                            <p className="text-sm font-medium text-slate-50 truncate">{team.name}</p>
                            <p className="text-sm text-slate-400 truncate">{team.email}</p>
                        </div>
                        <button onClick={() => handleRemoveTeam(index)} className="flex-shrink-0 h-7 w-7 flex items-center justify-center bg-red-900/50 text-red-400 rounded-full hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-red-500">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                             <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                           </svg>
                        </button>
                    </div>
                    ))}
                    {formData.teams.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No teams added yet.</p>}
                </div>
                <div className="mt-4 p-4 border border-slate-800 rounded-lg bg-slate-900/50">
                    <h5 className="text-sm font-medium text-slate-50 font-heading">Add New Team</h5>
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-start sm:space-x-3 space-y-3 sm:space-y-0">
                        <div className="flex-1">
                          <input type="text" placeholder="Team Name (e.g. Finance)" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className={`${darkTextInputStyle} ${teamErrors.name ? 'border-red-500' : ''}`} />
                          {teamErrors.name && <p className="mt-1 text-xs text-red-500">{teamErrors.name}</p>}
                        </div>
                        <div className="flex-1">
                          <input type="email" placeholder="team@example.com" value={newTeamEmail} onChange={(e) => setNewTeamEmail(e.target.value)} className={`${darkTextInputStyle} ${teamErrors.email ? 'border-red-500' : ''}`} />
                          {teamErrors.email && <p className="mt-1 text-xs text-red-500">{teamErrors.email}</p>}
                        </div>
                        <button onClick={handleAddTeam} className={`${darkPrimaryBtnStyle} bg-slate-700 hover:bg-slate-600 focus:ring-cyan-600`}>Add</button>
                    </div>
                </div>
            </div>

             <div className="pt-6 border-t border-slate-800">
                <h4 className="text-lg font-medium text-slate-50 font-heading">Policies & Documents</h4>
                 <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-2">
                    {formData.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                        <div className="flex-1 min-w-0 mr-4">
                            <p className="text-sm font-medium text-slate-50 truncate">{doc.name} <span className="text-xs font-normal text-slate-400">({doc.category})</span></p>
                            <p className="text-xs text-slate-500 truncate">{doc.fileName} ({(doc.fileSize / 1024).toFixed(1)} KB)</p>
                        </div>
                        <button onClick={() => handleRemoveDocument(doc.id)} className="flex-shrink-0 h-7 w-7 flex items-center justify-center bg-red-900/50 text-red-400 rounded-full hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-red-500">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                             <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                           </svg>
                        </button>
                    </div>
                    ))}
                    {formData.documents.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No documents uploaded yet.</p>}
                </div>
                <div className="mt-4 p-4 border border-slate-800 rounded-lg bg-slate-900/50">
                    <h5 className="text-sm font-medium text-slate-50 font-heading">Add New Document</h5>
                    <div className="mt-3 grid grid-cols-1 gap-4">
                        <input type="text" placeholder="Document Name" value={newDocName} onChange={(e) => setNewDocName(e.target.value)} className={darkTextInputStyle} />
                        <select value={newDocCategory} onChange={(e) => setNewDocCategory(e.target.value as DocumentCategory)} className={darkSelectStyle}>
                            {documentCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <div className="flex items-center space-x-3">
                            <label htmlFor="document-file" className={`cursor-pointer ${lightSecondaryBtnStyle}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                Choose file
                            </label>
                            <input type="file" id="document-file" onChange={(e) => setNewDocFile(e.target.files ? e.target.files[0] : null)} className="sr-only"/>
                            <span className="text-sm text-slate-500 truncate">{newDocFile ? newDocFile.name : 'No file chosen.'}</span>
                        </div>
                        <button onClick={handleAddDocument} disabled={!newDocName || !newDocFile} className={`${darkPrimaryBtnStyle} bg-slate-700 hover:bg-slate-600 focus:ring-cyan-600`}>
                          Add Document
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const UsersTab: React.FC<{ formData: Hotel; setFormData: React.Dispatch<React.SetStateAction<Hotel>> }> = ({ formData, setFormData }) => {
    const [newUser, setNewUser] = useState<Partial<HotelUser>>({ role: 'Staff', name: '', email: '', password: '' });
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewUser(prev => ({ ...prev, [name]: value }));
    };

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const handleAddUser = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const newErrors: { [key: string]: string } = {};
        
        if (!newUser.name) newErrors.name = 'Name is required';
        if (!newUser.email) newErrors.email = 'Email is required';
        else if (!validateEmail(newUser.email!)) newErrors.email = 'Invalid email address';
        if (!newUser.password) newErrors.password = 'Password is required';
        else if (newUser.password.length < 6) newErrors.password = 'Password must be at least 6 characters';

        setErrors(newErrors);

        if (Object.keys(newErrors).length === 0 && newUser.name && newUser.email && newUser.password && newUser.role) {
            const userToAdd: HotelUser = {
                id: `user_${Date.now()}`,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role as 'Manager' | 'Staff',
                password: newUser.password
            };
            setFormData(prev => ({ ...prev, users: [...(prev.users || []), userToAdd] }));
            setNewUser({ role: 'Staff', name: '', email: '', password: '' });
        }
    };

    const handleRemoveUser = (userId: string) => {
        setFormData(prev => ({ ...prev, users: prev.users.filter(u => u.id !== userId) }));
    };

    return (
        <div className="space-y-6">
            <div className="p-4 border border-slate-800 rounded-lg">
                <h4 className="font-semibold text-slate-50 font-heading">User Accounts</h4>
                <p className="text-sm text-slate-400 mb-4">Manage login credentials for property staff.</p>
                
                <div className="space-y-2 max-h-56 overflow-y-auto pr-2 mb-6">
                    {formData.users && formData.users.length > 0 ? (
                        formData.users.map((user) => (
                            <div key={user.id} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg">
                                <div className="flex-1 min-w-0 mr-4">
                                    <div className="flex items-center space-x-2">
                                        <p className="text-sm font-medium text-slate-50 truncate">{user.name}</p>
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${user.role === 'Manager' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300'}`}>{user.role}</span>
                                    </div>
                                    <p className="text-sm text-slate-400 truncate">{user.email}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Password: {user.password}</p>
                                </div>
                                <button onClick={() => handleRemoveUser(user.id)} className="flex-shrink-0 h-7 w-7 flex items-center justify-center bg-red-900/50 text-red-400 rounded-full hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-red-500">
                                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                     <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                   </svg>
                                </button>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-4">No users created yet.</p>
                    )}
                </div>

                <div className="border-t border-slate-800 pt-4">
                    <h5 className="text-sm font-medium text-slate-50 font-heading mb-3">Create New User</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
                            <input 
                                type="text" 
                                name="name" 
                                value={newUser.name} 
                                onChange={handleInputChange} 
                                placeholder="e.g. Alex Johnson" 
                                className={`${darkTextInputStyle} ${errors.name ? 'border-red-500' : ''}`} 
                            />
                            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
                            <input 
                                type="email" 
                                name="email" 
                                value={newUser.email} 
                                onChange={handleInputChange} 
                                placeholder="alex@hotel.com" 
                                className={`${darkTextInputStyle} ${errors.email ? 'border-red-500' : ''}`} 
                            />
                            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Initial Password</label>
                            <input 
                                type="text" 
                                name="password" 
                                value={newUser.password} 
                                onChange={handleInputChange} 
                                placeholder="Secret123" 
                                className={`${darkTextInputStyle} ${errors.password ? 'border-red-500' : ''}`} 
                            />
                            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                            <select 
                                name="role" 
                                value={newUser.role} 
                                onChange={handleInputChange} 
                                className={darkSelectStyle}
                            >
                                <option value="Staff">Staff</option>
                                <option value="Manager">Manager</option>
                            </select>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button onClick={handleAddUser} className={`${darkPrimaryBtnStyle} bg-slate-700 hover:bg-slate-600 focus:ring-cyan-600`}>
                            Add User
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AutomationTab: React.FC<{ formData: Hotel; setFormData: React.Dispatch<React.SetStateAction<Hotel>> }> = ({ formData, setFormData }) => {
    
    const handleToggle = (key: keyof AutomationSettings) => {
        setFormData(prev => ({ ...prev, automationSettings: { ...prev.automationSettings, [key]: !prev.automationSettings[key] } }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const parsedValue = type === 'number' ? parseFloat(value) : value;
        setFormData(prev => ({ ...prev, automationSettings: { ...prev.automationSettings, [name]: parsedValue } }));
    };

    return (
        <div className="space-y-6">
            <div className="p-4 border border-slate-800 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                    <label htmlFor="autoSubmissionEnabled" className="font-medium text-slate-50">Allow auto-submission of disputes</label>
                    <button onClick={() => handleToggle('autoSubmissionEnabled')} className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 ${formData.automationSettings.autoSubmissionEnabled ? 'bg-cyan-600' : 'bg-slate-600'}`}>
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${formData.automationSettings.autoSubmissionEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
                
                 <div>
                    <label htmlFor="autoSubmissionMinAmount" className="block text-sm font-medium text-slate-400">Minimum dispute amount ($)</label>
                    <input type="number" name="autoSubmissionMinAmount" id="autoSubmissionMinAmount" value={formData.automationSettings.autoSubmissionMinAmount} onChange={handleInputChange} className={`mt-1 block w-full sm:w-1/2 ${darkTextInputStyle}`} />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                    <label htmlFor="autoMarkNotContested" className="font-medium text-slate-50">Auto-mark very low-value disputes as not contested</label>
                    <button onClick={() => handleToggle('autoMarkNotContested')} className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 ${formData.automationSettings.autoMarkNotContested ? 'bg-cyan-600' : 'bg-slate-600'}`}>
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${formData.automationSettings.autoMarkNotContested ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export const HotelEditModal: React.FC<HotelEditModalProps> = ({ hotel, onSave, onClose }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState<Hotel>(hotel);
    const [activeTab, setActiveTab] = useState<EditTab>('details');
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [pspCredentials, setPspCredentials] = useState<PspCredentials | null>(null);
    const getPspCredentialsRef = useRef<(() => PspCredentials | null) | null>(null);
    const [operaCloudCredentials, setOperaCloudCredentials] = useState<OperaCloudCredentials | null>(null);
    const getOperaCloudCredentialsRef = useRef<(() => OperaCloudCredentials | null) | null>(null);

    useEffect(() => {
        setFormData(hotel);
    }, [hotel]);

    const handleSave = () => {
        const errors: { [key: string]: string } = {};
        if (!formData.name.trim()) {
            errors.name = 'Hotel name cannot be empty.';
        }
        setFormErrors(errors);
        if (Object.keys(errors).length === 0) {
            const currentPspCredentials = getPspCredentialsRef.current ? getPspCredentialsRef.current() : pspCredentials;
            const currentOperaCreds = getOperaCloudCredentialsRef.current ? getOperaCloudCredentialsRef.current() : operaCloudCredentials;
            onSave(formData, undefined, currentPspCredentials || undefined, currentOperaCreds || undefined);
        } else {
            setActiveTab('details');
        }
    };
    
    const isNewHotel = !hotel.name;

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose}></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-slate-900 rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
                    <div className="bg-slate-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-slate-800">
                        <h3 className="text-xl leading-6 font-semibold text-slate-50 font-heading" id="modal-title">
                            {isNewHotel ? 'Add New Hotel' : `Editing ${hotel.name}`}
                        </h3>
                    </div>
                    
                    <div className="p-6 border-b border-slate-800">
                        <div className="flex space-x-2">
                            <TabButton active={activeTab === 'details'} onClick={() => setActiveTab('details')}>Details</TabButton>
                            <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')}>Users & Login</TabButton>
                            <TabButton active={activeTab === 'integrations'} onClick={() => setActiveTab('integrations')}>Integrations</TabButton>
                            <TabButton active={activeTab === 'automation'} onClick={() => setActiveTab('automation')}>Automation & AI</TabButton>
                        </div>
                    </div>

                    <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
                        {activeTab === 'details' && <DetailsTab formData={formData} setFormData={setFormData} formErrors={formErrors} />}
                        {activeTab === 'users' && <UsersTab formData={formData} setFormData={setFormData} />}
                        {activeTab === 'integrations' && (
                            <ErrorBoundary>
                                <IntegrationsTab 
                                    formData={formData} 
                                    setFormData={setFormData} 
                                    onPspCredentialsChange={setPspCredentials}
                                    onGetPspCredentialsRef={(getter) => { getPspCredentialsRef.current = getter; }}
                                    onOperaCloudCredentialsChange={setOperaCloudCredentials}
                                    onGetOperaCloudCredentialsRef={(getter) => { getOperaCloudCredentialsRef.current = getter; }}
                                    isAdmin={user?.role === 'admin'}
                                />
                            </ErrorBoundary>
                        )}
                        {activeTab === 'automation' && <AutomationTab formData={formData} setFormData={setFormData} />}
                    </div>

                    <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-4 sm:px-6 flex flex-row-reverse border-t border-slate-800">
                        <button type="button" onClick={handleSave} className={darkPrimaryBtnStyle} disabled={!!formErrors.name}>
                            Save Changes
                        </button>
                        <button type="button" onClick={onClose} className={`mr-3 ${lightSecondaryBtnStyle} bg-transparent`}>
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
