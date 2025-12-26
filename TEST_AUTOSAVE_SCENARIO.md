# Test Scenario: Auto-Save Empty Process

## Test Case 1: Create Empty Process - Auto Form View

### Steps to Test:
1. Open the application
2. Click "Create Process" button (green button in header or in empty state)
3. Enter process details:
   - Process Name: "Test Empty Process"
   - Owner Name: "Test Owner"
   - **DO NOT** upload a file
4. Click "Continue"
5. **Expected**: 
   - ✅ Process is auto-saved immediately
   - ✅ **Form View loads automatically** (not diagram view)
   - ✅ No loading spinner appears
   - ✅ Process appears in the left sidebar under "PROCESSES"
   - ✅ Console shows: "✅ Empty process auto-saved with ID: [id]"
   - ✅ Console shows: "✅ Empty process created and ready for editing in Form View"
6. **Verify Form View Contents**:
   - ✅ Shows "Process Owner" input field with "Test Owner"
   - ✅ Shows "No process steps found in this diagram." message
   - ✅ Shows "Add Your First Step" button
   - ✅ "Form View" button in header is active/highlighted

### What Was Fixed:
- **Before**: Clicking "Form View" showed error "No diagram ID provided"
- **After**: Form View loads successfully because process was auto-saved with an ID

## Test Case 2: Add Steps in Form View

### Steps to Test:
1. Continue from Test Case 1 (in Form View with empty process)
2. Click "Add Your First Step" button
3. Fill in step details:
   - Process Content: "Step 1"
   - Step Owner: "Owner 1"
4. Click "Add Step" button
5. **Expected**:
   - New step appears in the form
   - Step shows as "Step 1" with shape badge "rectangle"
6. Click "Save Form" button
7. **Expected**:
   - Success message: "Changes saved successfully!"
   - Step is saved to database
8. Switch to "Diagram View"
9. **Expected**:
   - Diagram shows the step as a rectangle with "Step 1" label

## Test Case 3: Create Process with File Upload (Existing Behavior)

### Steps to Test:
1. Click "Create Process" button
2. Enter process details:
   - Process Name: "Test File Upload"
   - Owner Name: "File Owner"
   - **Upload** a .drawio file
3. Click "Continue"
4. **Expected**:
   - Diagram view loads with uploaded diagram
   - Process appears in sidebar
   - (File is processed using existing flow - NOT auto-saved yet)
5. Click "Save Process" button
6. **Expected**:
   - Process is saved to database
   - Success message appears
7. Switch to "Form View"
8. **Expected**:
   - Form view loads with steps from uploaded diagram

## Test Case 4: Multiple Empty Processes

### Steps to Test:
1. Create first empty process: "Process A"
2. **Expected**: Process A appears in sidebar
3. Click "Create Process" again (from header or sidebar)
4. Create second empty process: "Process B"
5. **Expected**: 
   - Process B appears in sidebar
   - Process B becomes the active process
   - Both processes are visible in sidebar
6. Click on "Process A" in sidebar
7. **Expected**: Loads Process A (empty diagram)
8. Switch to Form View
9. **Expected**: Form View shows Process A with "Add Your First Step"

## Test Case 5: Create Empty Process from Form View (Loading Spinner Fix)

### Steps to Test:
1. Load an existing process (e.g., "Process A")
2. Switch to Form View for "Process A"
3. Click "Create Process" button in the header
4. Enter process details:
   - Process Name: "New Process B"
   - Owner Name: "Owner B"
   - **DO NOT** upload a file
5. Click "Continue"
6. **Expected**:
   - ✅ **NO** loading spinner appears
   - ✅ **NO** "Loading editor and preparing your file..." message
   - ✅ Form View loads immediately
   - ✅ Shows Form View for "New Process B" (not "Process A")
   - ✅ Shows "Add Your First Step" button
   - ✅ "New Process B" is selected in sidebar
   - ✅ Can immediately start adding steps
7. Add a step and save
8. **Expected**: Step saves successfully
9. Switch to "Diagram View"
10. **Expected**: Diagram shows the added step

### What This Tests:
- Clears `pendingHeaderFile` state (prevents loading spinner)
- Clears `pendingFile` state
- Clears `processedFileRef.current`
- Switches to the new process properly
- Form View loads without issues

## Test Case 6: Error Handling

### Steps to Test:
1. **Simulate backend failure** (stop the backend server)
2. Click "Create Process" button
3. Enter process details
4. Click "Continue" (without file)
5. **Expected**:
   - Error alert: "Failed to create process. Please try again."
   - Modal does NOT close (user can try again)
   - Console shows error: "❌ Failed to auto-save empty process: [error]"
6. **Restart backend server**
7. Click "Continue" again
8. **Expected**: Process creates successfully

## Console Logs to Verify

### Successful Empty Process Creation:
```
🚀 Create Process Modal Continue: { processName: 'Test Empty Process', ownerName: 'Test Owner', hasFile: false }
📝 Creating empty process: Test Empty Process
✅ Creating and auto-saving empty process...
✅ Empty process auto-saved with ID: 507f1f77bcf86cd799439011
✅ Empty process created and ready for editing in Form View
✅ Closing Create Process modal
🔄 Switching to form view, it will reload latest data...
```

### Form View Loading Empty Process:
```
📥 FormView: Loaded diagram data: { nodeCount: 0, connectionCount: 0, nodeIds: [] }
📋 FormView: Initialized nodes: []
```

### Backend Parsing Empty XML:
```
📄 Diagram save request:
   - Name: Test Empty Process
   - Source: manual
   - Compressed: yes
   - XML length: 405
✅ Parsed diagram successfully:
   - Nodes: 0
   - Connections: 0
⚠️  WARNING: Parsed successfully but found 0 nodes and 0 connections!
   This might indicate the XML structure is different from expected.
```

## Browser Network Tab

### Verify API Calls:

1. **Create Empty Process** (auto-save):
   ```
   POST http://localhost:3001/api/diagrams
   Status: 201 Created
   Response: { id: "...", name: "Test Empty Process", parsedData: { nodes: [], connections: [] }, ... }
   ```

2. **Switch to Form View** (load process):
   ```
   GET http://localhost:3001/api/diagrams/[id]
   Status: 200 OK
   Response: { id: "...", name: "Test Empty Process", xml: "...", parsedData: { nodes: [], connections: [] }, ... }
   ```

3. **Add Step in Form** (save form):
   ```
   PUT http://localhost:3001/api/diagrams/[id]/rebuild
   Status: 200 OK
   Response: { ... parsedData: { nodes: [{ id: "...", label: "Step 1", ... }], connections: [] } }
   ```

## Success Criteria

✅ Empty process is created and saved automatically  
✅ Process appears in sidebar immediately  
✅ Form View loads successfully with empty process  
✅ "Add Your First Step" button is visible  
✅ User can add steps using Form View  
✅ Changes sync between Form View and Diagram View  
✅ Error handling works when backend is unavailable  
✅ Multiple empty processes can be created  
✅ Process list updates correctly  
✅ No linter errors in code  

## Regression Testing

Verify existing functionality still works:

✅ Creating process with file upload  
✅ Saving existing diagram changes  
✅ Switching between diagram and form views  
✅ Editing process names  
✅ Deleting processes  
✅ Loading saved processes from sidebar  
✅ View History functionality  

