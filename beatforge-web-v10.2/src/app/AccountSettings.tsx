'use client';

import {useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';
import './account-settings.css';

type Props={
  user:User;
  username:string;
  onUsernameChange:(value:string)=>void;
  onSaveProfile:()=>Promise<string>;
  onClose:()=>void;
  recoveryMode:boolean;
  onRecoveryDone:()=>void;
  settingsExport:()=>string;
  onSettingsImport:(text:string)=>boolean;
  syncStatus:string;
};

export default function AccountSettings({user,username,onUsernameChange,onSaveProfile,onClose,recoveryMode,onRecoveryDone,settingsExport,onSettingsImport,syncStatus}:Props){
  const [email,setEmail]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [transfer,setTransfer]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  const changeEmail=async()=>{
    const value=email.trim();
    if(!supabase||!value||!/^\S+@\S+\.\S+$/.test(value)){setMessage('Enter a valid new email address.');return}
    if(value.toLowerCase()===user.email?.toLowerCase()){setMessage('That is already your email address.');return}
    setBusy(true);setMessage('Updating email…');
    const {error}=await supabase.auth.updateUser({email:value});
    setBusy(false);setMessage(error?error.message:'Check your email for the confirmation link. Your current address may also receive a confirmation request.');
    if(!error)setEmail('');
  };
  const changePassword=async()=>{
    if(!supabase)return;
    if(newPassword.length<8){setMessage('Use at least 8 characters for your new password.');return}
    if(newPassword!==confirmPassword){setMessage('The new passwords do not match.');return}
    if(!recoveryMode&&!currentPassword){setMessage('Enter your current password first.');return}
    setBusy(true);setMessage('Updating password…');
    if(!recoveryMode){
      const {error:verifyError}=await supabase.auth.signInWithPassword({email:user.email||'',password:currentPassword});
      if(verifyError){setBusy(false);setMessage('Current password is incorrect.');return}
    }
    const {error}=await supabase.auth.updateUser({password:newPassword});
    setBusy(false);setMessage(error?error.message:'Password changed successfully.');
    if(!error){setCurrentPassword('');setNewPassword('');setConfirmPassword('');if(recoveryMode)onRecoveryDone()}
  };
  const sendReset=async()=>{
    if(!supabase||!user.email)return;
    setBusy(true);
    const {error}=await supabase.auth.resetPasswordForEmail(user.email);
    setBusy(false);setMessage(error?error.message:'Password reset email sent. Open it to set a new password.');
  };
  const copySettings=async()=>{
    const value=settingsExport();setTransfer(value);
    try{await navigator.clipboard.writeText(value);setMessage('Saved browser settings copied. Open BeatStrike on the new domain and paste them there.')}catch{setMessage('Settings are shown below. Copy the text manually.');}
  };
  const importSettings=()=>{setMessage(onSettingsImport(transfer)?'Settings imported and saved to your account.':'Could not read these settings. Paste the full code copied from the old domain.');};

  return <div className="resultBackdrop" role="dialog" aria-modal="true" aria-label="BeatStrike account settings" onClick={onClose}>
    <div className="resultCard accountSettingsCard" onClick={event=>event.stopPropagation()}>
      <small>BEATSTRIKE ACCOUNT</small><h2>{recoveryMode?'Set a new password':'Account settings'}</h2>
      <p className="authMessage accountIntro">Your game settings follow your account across devices and domains.</p>
      {!recoveryMode&&<>
        <section className="accountSettingsSection"><h3>Profile</h3><label className="fieldLabel">USERNAME<input className="authInput" maxLength={24} value={username} onChange={event=>onUsernameChange(event.target.value.replace(/[^a-zA-Z0-9_]/g,''))}/></label><button disabled={busy} onClick={()=>void onSaveProfile().then(setMessage)}>SAVE USERNAME</button></section>
        <section className="accountSettingsSection"><h3>Change email</h3><p>Current email: <strong>{user.email}</strong></p><label className="fieldLabel">NEW EMAIL<input className="authInput" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><button disabled={busy} onClick={()=>void changeEmail()}>SEND CONFIRMATION</button></section>
      </>}
      <section className="accountSettingsSection"><h3>{recoveryMode?'Choose your new password':'Change password'}</h3>
        {!recoveryMode&&<label className="fieldLabel">CURRENT PASSWORD<input className="authInput" type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></label>}
        <label className="fieldLabel">NEW PASSWORD<input className="authInput" type="password" autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></label>
        <label className="fieldLabel">CONFIRM NEW PASSWORD<input className="authInput" type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label>
        <div className="accountSettingsActions"><button disabled={busy} onClick={()=>void changePassword()}>SAVE NEW PASSWORD</button>{!recoveryMode&&<button className="secondary" disabled={busy} onClick={()=>void sendReset()}>FORGOT PASSWORD?</button>}</div>
      </section>
      {!recoveryMode&&<section className="accountSettingsSection"><h3>Move settings from another domain</h3><p>On the old site, copy the saved browser settings. On this site, paste the code and import it. Your account will remember the result.</p><div className="accountSettingsActions"><button className="secondary" onClick={()=>void copySettings()}>COPY SAVED BROWSER SETTINGS</button><button className="secondary" onClick={importSettings}>IMPORT SETTINGS</button></div><textarea className="authInput accountSettingsTransfer" aria-label="Settings transfer code" placeholder="Paste settings code here" value={transfer} onChange={event=>setTransfer(event.target.value)}/></section>}
      {syncStatus&&<p className="authMessage">{syncStatus}</p>}{message&&<p className="authMessage" role="status">{message}</p>}
      <div className="resultActions"><button className="secondary" onClick={onClose}>CLOSE</button></div>
    </div>
  </div>;
}
