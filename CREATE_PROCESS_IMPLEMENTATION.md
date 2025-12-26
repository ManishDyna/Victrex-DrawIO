# Create Process Feature Implementation

## Overview
Added a "Create Process" button that allows users to create a new process with or without uploading a diagram file. This provides a more flexible workflow for process creation.

## Features Implemented

### 1. Create Process Button
- **Location**: Navigation header, between "Available Processes" and "Upload Diagram"
- **Styling**: Green button with plus icon to distinguish from upload
- **Action**: Opens a modal dialog for process creation

### 2. Create Process Modal (`CreateProcessModal.jsx`)
A modal dialog with the following fields:

#### Input Fields:
- **Process Name** (required): The name of the process
- **Owner Name** (optional): The process owner's name
- **File Upload** (optional): Option to upload a diagram file (.drawio, .xml, .mxfile, .vsdx, .vsd)

#### Features:
- Form validation for required fields
- File validation for supported diagram formats
- Visual feedback for file selection
- Option to remove selected file
- Responsive design for mobile devices

### 3. Two Creation Paths

#### Path A: Without File Upload (Empty Diagram)
When user does NOT upload a file:
1. An empty draw.io diagram is generated
2. User is taken to the editor with a blank canvas
3. User can create/add steps using the form view
4. Process name and owner are pre-populated
5. When saved, the diagram XML is automatically generated based on form data
6. Changes in form reflect in diagram view and vice versa

#### Path B: With File Upload
When user uploads a file:
1. The file is processed using the existing "Upload Diagram" pipeline
2. Process name and owner from the modal are used
3. Diagram is imported and displayed
4. User can edit using both diagram and form views

## Files Modified

### Frontend

#### `frontend/src/App.jsx`
- Added `CreateProcessModal` import and state management
- Added "Create Process" button in navigation
- Implemented `handleCreateProcess` to open modal
- Implemented `handleCreateModalContinue` to handle modal submission
- Created `createEmptyDiagram()` function to generate empty diagram XML
- Added modal component to the render tree

#### `frontend/src/App.css`
- Added `.nav-link-create` styles for the new button (green theme)
- Matches existing button styles for consistency

#### `frontend/src/components/CreateProcessModal.jsx` (NEW)
- Complete modal component with form handling
- Validation logic for process name
- File upload handling with format validation
- Clean, modern UI matching the application theme

#### `frontend/src/components/CreateProcessModal.css` (NEW)
- Modal overlay and content styles
- Form input and button styles
- File upload UI components
- Responsive design for mobile devices
- Animations for modal appearance

#### `frontend/src/components/EditorPage.jsx`
- Added state variables: `pendingProcessName`, `pendingProcessOwner`, `isNewProcess`
- Updated file/diagram handling in `useEffect` to support empty diagrams
- Modified save logic to use pending process name/owner when available
- Added `processOwner` to diagram save API request
- Handles both file upload and empty diagram creation flows

### Backend

#### `backend/server.js`
- Updated POST `/api/diagrams` endpoint:
  - Added `processOwner` to request body extraction
  - Added `processOwner` to document creation
  - Updated JSDoc comment to reflect new parameter

## Empty Diagram Structure

The empty diagram generated has the following structure:

```xml
<mxfile host="app.diagrams.net" modified="[timestamp]" agent="Victrex Flowstudio" version="21.1.2" etag="[unique-id]" type="device">
  <diagram name="Page-1" id="page-[unique-id]">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

This provides:
- A valid draw.io diagram structure
- Default canvas settings (grid, guides, etc.)
- Empty root cells ready for content
- Timestamp and unique IDs for tracking

## User Flow

### Creating a Process Without File

1. Click "Create Process" button in header
2. Modal opens
3. Enter "Process Name" (required)
4. Optionally enter "Owner Name"
5. Leave file upload empty
6. Click "Continue"
7. Redirected to editor with blank canvas
8. Can switch to "Form View" to add process steps
9. Click "Save Process" when ready
10. Process saved with name and owner to database

### Creating a Process With File

1. Click "Create Process" button in header
2. Modal opens
3. Enter "Process Name" (required)
4. Optionally enter "Owner Name"
5. Click "Choose File" and select a diagram file
6. Click "Continue"
7. Redirected to editor with diagram loaded
8. File is processed as normal upload
9. Metadata (name, owner) already set
10. Click "Save Process" to save

## Benefits

1. **Unified Interface**: Single entry point for creating processes
2. **Metadata First**: Capture important metadata before starting work
3. **Flexibility**: Support both empty canvas and file import workflows
4. **Better Organization**: Process name and owner set upfront
5. **Reduced Friction**: No need to go through multiple steps
6. **Consistency**: Follows existing UI patterns and styling

## Technical Considerations

### State Management
- Process metadata stored in EditorPage state until first save
- Cleared after successful save to prevent reuse
- Proper cleanup when navigating away

### File Validation
- Supports same formats as "Upload Diagram": .drawio, .xml, .mxfile, .vsdx, .vsd
- Client-side validation before navigation
- Server-side parsing and validation as usual

### Empty Diagram Behavior
- Generated with unique IDs to prevent conflicts
- Minimal structure for draw.io compatibility
- Ready for both manual drawing and form-based creation
- Syncs with form view seamlessly

### Navigation
- Uses React Router state to pass data between components
- State cleared after processing to prevent re-triggering
- Proper handling of browser back/forward buttons

## Future Enhancements

Possible improvements for future iterations:

1. **Template Selection**: Offer pre-built diagram templates
2. **Process Categories**: Add category/department field
3. **Bulk Import**: Allow creating multiple processes from CSV
4. **Draft Mode**: Save drafts before final submission
5. **Collaborative Creation**: Multiple owners or team assignment
6. **Process Templates**: Save and reuse common process structures

## Testing Checklist

- [ ] Create process with name only (no file, no owner)
- [ ] Create process with name and owner (no file)
- [ ] Create process with file upload
- [ ] Validate required field (process name)
- [ ] Test file format validation
- [ ] Verify empty diagram loads correctly
- [ ] Verify form view works with empty diagram
- [ ] Verify diagram saves with correct metadata
- [ ] Test file removal in modal
- [ ] Test modal cancel/close functionality
- [ ] Verify mobile responsive design
- [ ] Test navigation flows (back/forward)
- [ ] Verify process appears in "Available Processes"
- [ ] Test switching between diagram and form views

## Known Limitations

1. Empty diagrams start completely blank - no default shapes or templates
2. Process owner cannot be changed after creation (would need PATCH endpoint update)
3. No draft/autosave for unsaved empty diagrams
4. File size limits inherited from existing upload functionality

## Conclusion

The "Create Process" feature successfully integrates into the existing workflow, providing users with a streamlined way to create new processes. The implementation maintains consistency with the existing codebase while adding valuable new functionality.

