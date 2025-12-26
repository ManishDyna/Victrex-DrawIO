import { useState } from 'react';
import './CreateProcessModal.css';

/**
 * CreateProcessModal
 * 
 * Modal for creating a new process with optional file upload
 * - Process Name (required)
 * - Owner Name (optional)
 * - File Upload (optional)
 */
function CreateProcessModal({ isOpen, onClose, onContinue }) {
  const [processName, setProcessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [errors, setErrors] = useState({});

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file extension
      const fileName = file.name.toLowerCase();
      const validExtensions = ['.drawio', '.xml', '.mxfile', '.vsdx', '.vsd'];
      const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

      if (!isValidFile) {
        setErrors({ 
          ...errors, 
          file: 'Please select a valid diagram file (.drawio, .xml, .mxfile, or .vsdx)' 
        });
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setErrors({ ...errors, file: null });
    }
  };

  const handleContinue = () => {
    const newErrors = {};

    if (!processName.trim()) {
      newErrors.processName = 'Process name is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Pass data to parent
    onContinue({
      processName: processName.trim(),
      ownerName: ownerName.trim() || null,
      file: selectedFile
    });

    // Reset form
    handleClose();
  };

  const handleClose = () => {
    setProcessName('');
    setOwnerName('');
    setSelectedFile(null);
    setErrors({});
    onClose();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setErrors({ ...errors, file: null });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Process</h2>
          <button className="modal-close-button" onClick={handleClose}>
            <i className="fa fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="processName">
              Process Name <span className="required">*</span>
            </label>
            <input
              id="processName"
              type="text"
              className={`form-input ${errors.processName ? 'input-error' : ''}`}
              value={processName}
              onChange={(e) => {
                setProcessName(e.target.value);
                setErrors({ ...errors, processName: null });
              }}
              placeholder="Enter process name"
              autoFocus
            />
            {errors.processName && (
              <span className="error-message">{errors.processName}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="ownerName">Owner Name</label>
            <input
              id="ownerName"
              type="text"
              className="form-input"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Enter owner name (optional)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="fileUpload">
              Upload Diagram <span className="optional-label">(optional)</span>
            </label>
            <div className="file-upload-container">
              <input
                id="fileUpload"
                type="file"
                accept=".drawio,.xml,.mxfile,.vsdx,.vsd"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              
              {!selectedFile ? (
                <button
                  type="button"
                  className="file-select-button"
                  onClick={() => document.getElementById('fileUpload').click()}
                >
                  <i className="fa fa-file-import"></i>
                  <span>Choose File</span>
                </button>
              ) : (
                <div className="selected-file">
                  <div className="file-info">
                    <i className="fa fa-file-alt"></i>
                    <span className="file-name">{selectedFile.name}</span>
                  </div>
                  <button
                    type="button"
                    className="file-remove-button"
                    onClick={handleRemoveFile}
                    title="Remove file"
                  >
                    <i className="fa fa-times"></i>
                  </button>
                </div>
              )}
            </div>
            {errors.file && (
              <span className="error-message">{errors.file}</span>
            )}
            <p className="help-text">
              {!selectedFile 
                ? 'Leave empty to start with a blank diagram' 
                : 'The diagram will be imported into the editor'
              }
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-button secondary" onClick={handleClose}>
            Cancel
          </button>
          <button className="modal-button primary" onClick={handleContinue}>
            <i className="fa fa-arrow-right"></i>
            <span>Continue</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateProcessModal;

