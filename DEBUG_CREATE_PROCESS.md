# Debugging Create Process Feature

## Issue
Process is not being created when using the "Create Process" button from the editor's empty state.

## Debugging Steps

### 1. Check Console Logs

When you click "Create Process" and fill out the form, you should see these console messages:

```
🚀 Create Process Modal Continue: {
  processName: "Your Process Name",
  ownerName: "Owner Name or empty",
  hasFile: false,
  fileName: undefined
}

📝 Creating empty process: Your Process Name
✅ Setting empty diagram XML (length: 478)
✅ Setting pendingProcessName: Your Process Name
✅ Setting pendingProcessOwner: Owner Name
✅ Empty process setup complete. You should now see the diagram editor.
✅ Closing Create Process modal
```

**If you don't see these logs:**
- The modal might not be submitting correctly
- Check if the "Continue" button is clickable
- Check browser console for any errors

### 2. Check Save Button State

After the modal closes, you should see the diagram editor. Check the "Save Process" button:

**Button should be ENABLED if:**
- `editorReady` = true
- `diagramXml` is set (not null)
- `isSaving` = false (not currently saving)

**Button will be DISABLED if:**
- Editor is not ready yet
- DiagramXml is null or undefined
- Currently saving

### 3. Test the Save Flow

When you click "Save Process", check console for:

```
💾 Saving diagram to database:
   - Name: Your Process Name (from pendingProcessName)
   - Source: manual
   - Is new file upload: true
   - Last saved ID: null
   - Diagram ID: Page-1 (default)
   - XML length: 478 chars
```

### 4. Common Issues

#### Issue: Modal doesn't close
**Solution:** Check if `setIsCreateModalOpen(false)` is being called

#### Issue: Save button is disabled
**Possible causes:**
- `diagramXml` is not being set
- `editorReady` is false (editor still loading)

**Check:**
```javascript
console.log('Editor state:', {
  editorReady,
  hasD iagramXml: !!diagramXml,
  diagramXmlLength: diagramXml?.length,
  isSaving
});
```

#### Issue: Process name prompt appears
**Cause:** `pendingProcessName` is null when saving

**Solution:** Check if `setPendingProcessName` was called in `handleCreateModalContinue`

#### Issue: Editor shows empty/blank
**Possible causes:**
- `diagramXml` is not valid
- DrawIOEditor failed to load
- Editor iframe not initialized

**Check:**
```javascript
console.log('DiagramXml:', diagramXml?.substring(0, 200));
```

### 5. Manual Testing Checklist

- [ ] Click "Create Process" button in empty state
- [ ] Modal opens
- [ ] Enter process name (required)
- [ ] Enter owner name (optional)
- [ ] Leave file upload empty
- [ ] Click "Continue"
- [ ] Modal closes
- [ ] Diagram editor appears (white canvas with draw.io toolbar)
- [ ] "Save Process" button is enabled (not grayed out)
- [ ] Click "Save Process"
- [ ] No prompt for process name (should use the one from modal)
- [ ] Success message appears
- [ ] Process appears in sidebar list

### 6. Network Debugging

Open browser DevTools → Network tab:

**When saving, should see:**
- POST request to `http://localhost:3001/api/diagrams`
- Request payload includes:
  ```json
  {
    "name": "Your Process Name",
    "xml": "<mxfile...",
    "sourceFileName": undefined,
    "diagramId": "Page-1",
    "processOwner": "Owner Name"
  }
  ```
- Response should be 201 (Created) or 200 (OK)

**If 400 or 500 error:**
- Check request payload
- Check backend console for errors
- Verify MongoDB is connected

### 7. Quick Fix Attempts

#### If save button is disabled:
```javascript
// Manually set diagram XML in console (for testing only)
// Open browser console and run:
const emptyXml = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Victrex Flowstudio" version="21.1.2" etag="${Date.now()}" type="device">
  <diagram name="Page-1" id="page-${Date.now()}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
// Then check if button becomes enabled
```

### 8. Alternative Workaround

If the empty diagram approach isn't working, try:

1. Create process from header "Create Process" button (this should work)
2. Or use "Create Process" and upload a small diagram file

### 9. Files to Check

If issues persist, verify these files:

**frontend/src/components/EditorPage.jsx:**
- `handleCreateModalContinue` function (lines ~682-726)
- `handleSaveClick` function
- `handleExport` function (should use `pendingProcessName`)

**frontend/src/components/CreateProcessModal.jsx:**
- `handleContinue` function
- Form validation

**backend/server.js:**
- POST `/api/diagrams` endpoint
- Check for any validation that might reject empty diagrams

### 10. Expected Behavior

**Normal Flow:**
1. Click "Create Process" → Modal opens ✅
2. Fill form → Form validates ✅
3. Click "Continue" → Modal closes, editor shows ✅
4. Can see draw.io canvas and toolbar ✅
5. Save button is enabled ✅
6. Click "Save Process" → No prompt, saves immediately ✅
7. Success message appears ✅
8. Process appears in sidebar ✅
9. Can switch to Form View ✅
10. Can add steps in Form View ✅

## Additional Debugging Commands

Add these to your component temporarily for debugging:

```javascript
// In EditorPage, add useEffect to log state changes
useEffect(() => {
  console.log('📊 Editor State Update:', {
    editorReady,
    hasDialogramXml: !!diagramXml,
    diagramXmlLength: diagramXml?.length,
    pendingProcessName,
    pendingProcessOwner,
    isNewFileUpload,
    isNewProcess,
    activeProcessId,
    lastSavedId
  });
}, [editorReady, diagramXml, pendingProcessName, pendingProcessOwner, isNewFileUpload, isNewProcess]);
```

## Contact Points

If debugging doesn't reveal the issue, provide:
1. Browser console logs (all messages)
2. Network tab (failed requests)
3. Steps you followed
4. What you expected vs. what happened

