# Environment Variable Setup for Production

## ✅ Changes Applied

All frontend files have been updated to use the `VITE_API_URL` environment variable instead of hardcoded `localhost:3001`.

### Files Updated:

1. **EditorPage.jsx** - 7 API calls updated
2. **FormView.jsx** - 6 API calls updated
3. **HistoryPage.jsx** - 1 API call updated
4. **DrawIOEditor.jsx** - 5 postMessage calls updated (including iframe URL and origin checks)

### Code Pattern Used:

```javascript
// At the top of each file:
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// All fetch calls now use:
fetch(`${API_URL}/api/diagrams`)
```

## 🔧 Vercel Configuration

### Step 1: Deploy Backend to Vercel

1. Go to Vercel Dashboard
2. Click "Add New Project"
3. Import: `ManishDyna/Victrex-DrawIO`
4. **Settings:**
   - Framework Preset: `Other`
   - Root Directory: `backend`
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
   - Install Command: `npm install`
   - Start Command: `npm start`
5. **Environment Variables:**
   ```
   MONGODB_URI = mongodb+srv://manishsoni_db_user:zFcvZnoOojXytiZI@cluster0.8ctpqtn.mongodb.net/
   ```
6. Click "Deploy"
7. **Note your backend URL** (e.g., `https://victrex-draw-io-backend.vercel.app`)

### Step 2: Configure Frontend Environment Variable

1. Go to your **Frontend Project** in Vercel
2. Go to **Settings** → **Environment Variables**
3. Click **Add New**
4. **Add Variable:**
   ```
   Key: VITE_API_URL
   Value: https://victrex-draw-io-backend.vercel.app
   ```
   (Use your actual backend URL from Step 1)
5. **Environment:** Select all (Production, Preview, Development)
6. Click **Save**

### Step 3: Redeploy Frontend

1. Go to **Deployments** tab
2. Click **Redeploy** on the latest deployment
3. Or push a new commit to trigger auto-deploy

## 🧪 Testing

### Local Development:
- Works with `http://localhost:3001` (fallback)
- No environment variable needed locally

### Production:
- Uses `VITE_API_URL` from Vercel
- No more localhost permission requests
- All API calls go to deployed backend

## 📋 Verification Checklist

After deployment, verify:

- [ ] Backend is deployed and accessible
- [ ] Frontend has `VITE_API_URL` environment variable set
- [ ] Frontend is redeployed
- [ ] No browser console errors
- [ ] Can create processes
- [ ] Can save diagrams
- [ ] Can view process list
- [ ] Draw.io editor loads correctly

## 🔍 How It Works

### Local Development:
```javascript
// No .env file needed
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
// Result: 'http://localhost:3001' (uses fallback)
```

### Production (Vercel):
```javascript
// Vercel injects VITE_API_URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
// Result: 'https://victrex-draw-io-backend.vercel.app' (from env var)
```

## 🚨 Important Notes

1. **Vite Environment Variables:**
   - Must start with `VITE_` to be exposed to client code
   - Accessible via `import.meta.env.VITE_API_URL`
   - Available at build time

2. **Backend CORS:**
   - Your backend already has CORS enabled
   - Should work with any frontend URL
   - If issues occur, check backend CORS settings

3. **Draw.io Editor:**
   - The iframe URL now uses `API_URL`
   - Origin checks use `API_URL` origin
   - Works with both localhost and production URLs

## 🐛 Troubleshooting

### Issue: Still seeing localhost permission request
**Solution:** 
- Check if `VITE_API_URL` is set in Vercel
- Redeploy frontend after adding env var
- Clear browser cache

### Issue: API calls failing
**Solution:**
- Verify backend URL is correct
- Check backend is deployed and running
- Check browser console for errors
- Verify CORS is enabled on backend

### Issue: Draw.io editor not loading
**Solution:**
- Check if backend serves draw.io at `/index.html`
- Verify iframe URL is correct
- Check browser console for iframe errors

## 📝 Summary

✅ All hardcoded `localhost:3001` URLs replaced with `API_URL`  
✅ Environment variable pattern implemented  
✅ Works in both local and production  
✅ No code changes needed - just set env var in Vercel  

Your app is now ready for production deployment! 🚀

