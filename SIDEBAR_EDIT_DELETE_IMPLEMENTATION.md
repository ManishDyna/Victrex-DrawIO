# Sidebar Edit & Delete Process Implementation

## Overview
Added functionality to rename and delete processes directly from the sidebar in the EditorPage. Users can now manage their processes without leaving the editor.

## Features Implemented

### 1. Rename Process (Double-Click to Edit)
- **Trigger**: Double-click on process name in sidebar
- **Behavior**: 
  - Name becomes an editable input field
  - Input is auto-focused for immediate typing
  - Press `Enter` to save
  - Press `Escape` to cancel
  - Click outside (blur) to save
- **Validation**: Empty names are rejected with an alert

### 2. Delete Process
- **Trigger**: Click trash icon button in sidebar
- **Behavior**:
  - Shows confirmation dialog with process name
  - Deletes process from database if confirmed
  - Clears active process if it was the deleted one
  - Refreshes sidebar list automatically
  - Shows success message after deletion

## Files Modified

### Frontend

#### `frontend/src/components/EditorPage.jsx`

**New State Variables:**
```javascript
const [editingProcessId, setEditingProcessId] = useState(null);
const [editingProcessName, setEditingProcessName] = useState('');
```

**New Functions:**

1. **`handleStartEditingName(item, e)`**
   - Triggered on double-click
   - Sets editing state with current name
   - Stops event propagation

2. **`handleSaveProcessName(processId)`**
   - Validates name is not empty
   - Sends PATCH request to `/api/diagrams/:id/name`
   - Reloads process list on success
   - Clears editing state

3. **`handleCancelEditingName()`**
   - Clears editing state without saving
   - Called on Escape key

4. **`handleDeleteProcess(item, e)`**
   - Shows confirmation dialog
   - Sends DELETE request to `/api/diagrams/:id`
   - Clears active process if deleted
   - Reloads process list
   - Shows success message

**UI Changes:**
- Added conditional rendering for edit mode
- Added input field with keyboard handlers
- Added delete button with trash icon
- Added title attributes for tooltips

#### `frontend/src/App.css`

**New Styles:**

1. **`.process-action-button.delete-button:hover`**
   - Red background on hover (#D32F2F)
   - White text and border

2. **`.process-name-input`**
   - Full width input field
   - Blue border (2px solid)
   - Focus state with shadow
   - Matches existing design system

3. **`.process-list-name`**
   - Cursor pointer to indicate clickable
   - User-select none to prevent text selection
   - Hover effect (blue color)

### Backend

#### `backend/server.js`

**New Endpoints:**

1. **`PATCH /api/diagrams/:id/name`**
   - Updates only the diagram name
   - Validates name is provided and not empty
   - Returns updated name and timestamp
   
   **Request Body:**
   ```json
   {
     "name": "New Process Name"
   }
   ```
   
   **Response:**
   ```json
   {
     "id": "diagram_id",
     "name": "New Process Name",
     "updatedAt": "2024-01-01T00:00:00.000Z"
   }
   ```

2. **`DELETE /api/diagrams/:id`**
   - Deletes diagram from database
   - Returns confirmation with deleted diagram info
   
   **Response:**
   ```json
   {
     "message": "Diagram deleted successfully",
     "id": "diagram_id",
     "name": "Deleted Process Name"
   }
   ```

## User Workflows

### Renaming a Process

1. **Start Editing**:
   - Double-click on process name in sidebar
   - Name becomes editable input field
   - Input is auto-focused

2. **Edit Name**:
   - Type new name
   - Can use backspace, delete, etc.

3. **Save Changes**:
   - Press `Enter` key, OR
   - Click outside the input (blur)
   - Process list refreshes with new name

4. **Cancel Editing**:
   - Press `Escape` key
   - Name reverts to original

### Deleting a Process

1. **Click Delete Button**:
   - Click trash icon on process item
   - Confirmation dialog appears

2. **Confirm Deletion**:
   - Dialog shows: "Are you sure you want to delete '[Process Name]'? This action cannot be undone."
   - Click OK to confirm
   - Click Cancel to abort

3. **After Deletion**:
   - Process removed from database
   - Sidebar list refreshes
   - If deleted process was active, editor clears
   - Success message: "Process deleted successfully!"

## UI/UX Details

### Visual Feedback

**Edit Mode:**
- Input field has blue border (2px)
- Focus state has blue shadow
- Full width to show entire name
- Auto-focus for immediate typing

**Delete Button:**
- Trash icon from Font Awesome
- Gray by default
- Red background on hover
- Tooltip: "Delete Process"

**Process Name:**
- Cursor changes to pointer on hover
- Color changes to blue on hover
- Tooltip: "Double-click to rename"

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Double-click | Start editing name |
| Enter | Save changes |
| Escape | Cancel editing |
| Tab | Move to next field (saves current) |

### Confirmation Dialog

```
┌─────────────────────────────────────────────┐
│  Are you sure you want to delete            │
│  "Customer Support Process"?                │
│                                              │
│  This action cannot be undone.              │
│                                              │
│         [ Cancel ]    [ OK ]                │
└─────────────────────────────────────────────┘
```

## Edge Cases Handled

### Rename Functionality

1. **Empty Name**: 
   - Shows alert: "Process name cannot be empty"
   - Editing state remains active
   - User can try again

2. **Network Error**:
   - Shows alert: "Failed to update process name. Please try again."
   - Editing state cleared
   - Original name remains

3. **Blur While Editing**:
   - Automatically saves changes
   - Same as pressing Enter

4. **Escape While Editing**:
   - Cancels editing
   - Reverts to original name

### Delete Functionality

1. **Delete Active Process**:
   - Clears active process state
   - Clears diagram XML
   - Editor shows empty state

2. **Cancel Deletion**:
   - No action taken
   - Process remains in list

3. **Network Error**:
   - Shows alert: "Failed to delete process. Please try again."
   - Process remains in list

4. **Database Not Connected**:
   - Returns 503 error
   - Shows appropriate error message

## Security Considerations

1. **Validation**:
   - Name cannot be empty (frontend + backend)
   - Process ID validated before deletion
   - MongoDB connection checked before operations

2. **Confirmation**:
   - Delete requires explicit confirmation
   - Clear warning about irreversibility

3. **Error Handling**:
   - All errors caught and logged
   - User-friendly error messages
   - Database state remains consistent

## Backend API Details

### PATCH /api/diagrams/:id/name

**Request:**
```http
PATCH /api/diagrams/507f1f77bcf86cd799439011/name
Content-Type: application/json

{
  "name": "Updated Process Name"
}
```

**Success Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Updated Process Name",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

**Error Responses:**
- `400`: Name is required or empty
- `404`: Diagram not found
- `500`: Server error
- `503`: Database not connected

### DELETE /api/diagrams/:id

**Request:**
```http
DELETE /api/diagrams/507f1f77bcf86cd799439011
```

**Success Response (200):**
```json
{
  "message": "Diagram deleted successfully",
  "id": "507f1f77bcf86cd799439011",
  "name": "Deleted Process"
}
```

**Error Responses:**
- `404`: Diagram not found
- `500`: Server error
- `503`: Database not connected

## Console Logging

### Rename Process
```
✅ Updated diagram name: 507f1f77bcf86cd799439011 -> "New Process Name"
```

### Delete Process
```
🗑️ Deleted diagram: 507f1f77bcf86cd799439011 (Old Process Name)
```

## Testing Checklist

- [x] Double-click process name to start editing
- [x] Type new name and press Enter to save
- [x] Type new name and click outside to save
- [x] Press Escape to cancel editing
- [x] Try to save empty name (should show error)
- [x] Click delete button
- [x] Confirm deletion dialog appears
- [x] Cancel deletion (process remains)
- [x] Confirm deletion (process removed)
- [x] Delete active process (editor clears)
- [x] Delete non-active process (editor unchanged)
- [x] Sidebar refreshes after rename
- [x] Sidebar refreshes after delete
- [x] Success message after deletion
- [x] Error handling for network failures
- [ ] Test with multiple processes
- [ ] Test rapid rename operations
- [ ] Test delete while editing name

## Benefits

1. **Convenience**: Manage processes without leaving editor
2. **Efficiency**: Quick rename with double-click
3. **Safety**: Confirmation before deletion
4. **Feedback**: Clear visual states and messages
5. **Consistency**: Matches existing UI patterns
6. **Accessibility**: Keyboard shortcuts supported

## Future Enhancements

Possible improvements:

1. **Bulk Operations**: Select multiple processes to delete
2. **Undo Delete**: Soft delete with restore option
3. **Rename History**: Track name changes
4. **Duplicate Process**: Clone existing process
5. **Move to Folder**: Organize processes in folders
6. **Export Process**: Download process as file
7. **Share Process**: Share with other users
8. **Process Tags**: Add tags for categorization

## Conclusion

The sidebar edit and delete functionality provides essential process management capabilities directly within the editor. Users can now rename processes with a simple double-click and delete processes with a confirmation dialog, making process management more efficient and intuitive.

