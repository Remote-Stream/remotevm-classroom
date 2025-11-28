        'use strict';

        /* =============================================
           Configuration & Constants
           ============================================= */
        const CONFIG = {
            SERVER_URL: 'https://server.remotevm.ir',
            WHITEBOARD_URL: 'https://server.remotevm.ir/whiteboard',
            
            // Validation
            MIN_ROOM_ID_LENGTH: 6,
            MAX_ROOM_ID_LENGTH: 20,
            MIN_PASSWORD_LENGTH: {
                simple: 4,
                complex: 8
            },
            MAX_NAME_LENGTH: 50,
            MAX_CLASS_NAME_LENGTH: 30,
            
            // Storage
            MAX_CLASS_HISTORY: 10,
            STORAGE_KEYS: {
                TEACHER_CLASSES: 'remotevm_teacher_classes',
                STUDENT_CLASSES: 'remotevm_student_classes',
                LAST_SESSION: 'remotevm_last_session'
            },
            
            // Timing
            TOAST_DURATION: 4000,
            LOADING_MIN_TIME: 500,
            DEBOUNCE_DELAY: 300,
            
            // Patterns
            PATTERNS: {
                ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
                ROOM_ID: /^[a-zA-Z0-9]{6,20}$/,
                PASSWORD_SIMPLE: /^.{4,}$/,
                PASSWORD_COMPLEX: /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/
            }
        };

        /* =============================================
           Application State
           ============================================= */
        const AppState = {
            _state: {
                currentView: 'roleSelection', // roleSelection, teacherForm, studentForm, classroom
                currentRole: null, // teacher, student
                roomInfo: {
                    roomId: '',
                    password: '',
                    className: ''
                },
                userInfo: {
                    name: '',
                    role: ''
                },
                settings: {
                    isSimplePassword: true,
                    isMinimalRoom: true
                },
                classroom: {
                    isActive: false,
                    isFullscreen: false,
                    startTime: null,
                    timerInterval: null
                },
                ui: {
                    isMenuOpen: false,
                    isLoading: false
                }
            },
            
            _listeners: new Map(),
            
            get(path) {
                return path.split('.').reduce((obj, key) => obj?.[key], this._state);
            },
            
            set(path, value) {
                const keys = path.split('.');
                const lastKey = keys.pop();
                const target = keys.reduce((obj, key) => obj[key], this._state);
                
                if (target && lastKey) {
                    const oldValue = target[lastKey];
                    target[lastKey] = value;
                    this._notify(path, value, oldValue);
                }
            },
            
            subscribe(path, callback) {
                if (!this._listeners.has(path)) {
                    this._listeners.set(path, new Set());
                }
                this._listeners.get(path).add(callback);
                
                return () => this._listeners.get(path)?.delete(callback);
            },
            
            _notify(path, newValue, oldValue) {
                this._listeners.forEach((callbacks, subscribedPath) => {
                    if (path.startsWith(subscribedPath) || subscribedPath.startsWith(path)) {
                        callbacks.forEach(cb => cb(newValue, oldValue, path));
                    }
                });
            }
        };

        /* =============================================
           Utility Functions
           ============================================= */
        const Utils = {
            // DOM Helpers
            $(selector) {
                return document.querySelector(selector);
            },
            
            $$(selector) {
                return document.querySelectorAll(selector);
            },
            
            createElement(tag, attributes = {}, children = []) {
                const element = document.createElement(tag);
                
                Object.entries(attributes).forEach(([key, value]) => {
                    if (key === 'className') {
                        element.className = value;
                    } else if (key === 'dataset') {
                        Object.entries(value).forEach(([dataKey, dataValue]) => {
                            element.dataset[dataKey] = dataValue;
                        });
                    } else if (key.startsWith('on') && typeof value === 'function') {
                        element.addEventListener(key.slice(2).toLowerCase(), value);
                    } else {
                        element.setAttribute(key, value);
                    }
                });
                
                children.forEach(child => {
                    if (typeof child === 'string') {
                        element.appendChild(document.createTextNode(child));
                    } else if (child instanceof Node) {
                        element.appendChild(child);
                    }
                });
                
                return element;
            },
            
            // String Helpers
            sanitize(str) {
                if (typeof str !== 'string') return '';
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            },
            
            escapeHtml(str) {
                const escapeMap = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;'
                };
                return str.replace(/[&<>"']/g, char => escapeMap[char]);
            },
            
            generateId(prefix = 'class', length = 8) {
                const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
                let result = prefix;
                for (let i = 0; i < length; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            },
            
            // Validation Helpers
            validateInput(value, type) {
                const trimmed = value?.trim() || '';
                
                switch (type) {
                    case 'name':
                        return trimmed.length >= 2 && trimmed.length <= CONFIG.MAX_NAME_LENGTH;
                    
                    case 'className':
                        return CONFIG.PATTERNS.ALPHANUMERIC.test(trimmed) && 
                               trimmed.length <= CONFIG.MAX_CLASS_NAME_LENGTH;
                    
                    case 'roomId':
                        return CONFIG.PATTERNS.ROOM_ID.test(trimmed);
                    
                    case 'password':
                        const pattern = AppState.get('settings.isSimplePassword') 
                            ? CONFIG.PATTERNS.PASSWORD_SIMPLE 
                            : CONFIG.PATTERNS.PASSWORD_COMPLEX;
                        return pattern.test(trimmed);
                    
                    default:
                        return trimmed.length > 0;
                }
            },
            
            // Debounce
            debounce(func, wait) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            },
            
            // Time Formatting
            formatTime(seconds) {
                const hrs = Math.floor(seconds / 3600);
                const mins = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                
                return [hrs, mins, secs]
                    .map(val => String(val).padStart(2, '0'))
                    .join(':');
            },
            
            // Clipboard
            async copyToClipboard(text) {
                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(text);
                        return true;
                    }
                    
                    // Fallback
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    
                    const success = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    return success;
                } catch (err) {
                    console.error('Copy failed:', err);
                    return false;
                }
            }
        };

        /* =============================================
           Storage Manager
           ============================================= */
        const StorageManager = {
            _isAvailable: null,
            
            isAvailable() {
                if (this._isAvailable !== null) return this._isAvailable;
                
                try {
                    const test = '__storage_test__';
                    localStorage.setItem(test, test);
                    localStorage.removeItem(test);
                    this._isAvailable = true;
                } catch (e) {
                    this._isAvailable = false;
                }
                
                return this._isAvailable;
            },
            
            get(key, defaultValue = null) {
                if (!this.isAvailable()) return defaultValue;
                
                try {
                    const item = localStorage.getItem(key);
                    return item ? JSON.parse(item) : defaultValue;
                } catch (e) {
                    console.error('Storage get error:', e);
                    return defaultValue;
                }
            },
            
            set(key, value) {
                if (!this.isAvailable()) return false;
                
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                    return true;
                } catch (e) {
                    console.error('Storage set error:', e);
                    return false;
                }
            },
            
            remove(key) {
                if (!this.isAvailable()) return false;
                
                try {
                    localStorage.removeItem(key);
                    return true;
                } catch (e) {
                    return false;
                }
            },
            
            // Class History Management
            getClassHistory(role) {
                const key = role === 'teacher' 
                    ? CONFIG.STORAGE_KEYS.TEACHER_CLASSES 
                    : CONFIG.STORAGE_KEYS.STUDENT_CLASSES;
                return this.get(key, []);
            },
            
            saveClassHistory(role, classData) {
                const key = role === 'teacher' 
                    ? CONFIG.STORAGE_KEYS.TEACHER_CLASSES 
                    : CONFIG.STORAGE_KEYS.STUDENT_CLASSES;
                
                let history = this.getClassHistory(role);
                
                // Remove duplicate
                history = history.filter(cls => cls.roomId !== classData.roomId);
                
                // Add to beginning
                history.unshift(classData);
                
                // Limit size
                if (history.length > CONFIG.MAX_CLASS_HISTORY) {
                    history = history.slice(0, CONFIG.MAX_CLASS_HISTORY);
                }
                
                return this.set(key, history);
            }
        };

        /* =============================================
           Toast Notification System
           ============================================= */
        const Toast = {
            _timeout: null,
            _element: null,
            
            init() {
                this._element = Utils.$('#toast');
                this._messageEl = Utils.$('#toastMessage');
                this._iconEl = Utils.$('.toast__icon');
                
                Utils.$('#toastClose')?.addEventListener('click', () => this.hide());
            },
            
            show(message, type = 'success') {
                if (!this._element) return;
                
                // Clear existing timeout
                if (this._timeout) {
                    clearTimeout(this._timeout);
                }
                
                // Update content
                this._messageEl.textContent = message;
                
                // Update type
                this._element.className = `toast toast--${type} toast--visible`;
                
                // Update icon
                const icons = {
                    success: '<polyline points="20 6 9 17 4 12"></polyline>',
                    error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
                    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'
                };
                
                this._iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[type] || icons.success}</svg>`;
                
                // Auto hide
                this._timeout = setTimeout(() => this.hide(), CONFIG.TOAST_DURATION);
            },
            
            hide() {
                if (this._element) {
                    this._element.classList.remove('toast--visible');
                }
                
                if (this._timeout) {
                    clearTimeout(this._timeout);
                    this._timeout = null;
                }
            },
            
            success(message) {
                this.show(message, 'success');
            },
            
            error(message) {
                this.show(message, 'error');
            },
            
            warning(message) {
                this.show(message, 'warning');
            }
        };

        /* =============================================
           Loading Manager
           ============================================= */
        const Loading = {
            _element: null,
            _textEl: null,
            
            init() {
                this._element = Utils.$('#loading');
                this._textEl = Utils.$('#loadingText');
            },
            
            show(text = 'در حال بارگذاری...') {
                if (!this._element) return;
                
                AppState.set('ui.isLoading', true);
                this._textEl.textContent = text;
                this._element.classList.add('loading--visible');
            },
            
            hide() {
                if (!this._element) return;
                
                AppState.set('ui.isLoading', false);
                this._element.classList.remove('loading--visible');
            },
            
            async withLoading(asyncFn, text) {
                this.show(text);
                
                const startTime = Date.now();
                
                try {
                    const result = await asyncFn();
                    
                    // Ensure minimum loading time for better UX
                    const elapsed = Date.now() - startTime;
                    if (elapsed < CONFIG.LOADING_MIN_TIME) {
                        await new Promise(r => setTimeout(r, CONFIG.LOADING_MIN_TIME - elapsed));
                    }
                    
                    return result;
                } finally {
                    this.hide();
                }
            }
        };

        /* =============================================
           Menu Manager
           ============================================= */
        const Menu = {
            _menuEl: null,
            _overlayEl: null,
            
            init() {
                this._menuEl = Utils.$('#sideMenu');
                this._overlayEl = Utils.$('#menuOverlay');
                
                // Event listeners
                Utils.$('#menuToggle')?.addEventListener('click', () => this.toggle());
                Utils.$('#classroomMenuToggle')?.addEventListener('click', () => this.toggle());
                Utils.$('#menuClose')?.addEventListener('click', () => this.close());
                this._overlayEl?.addEventListener('click', () => this.close());
                
                // Escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && AppState.get('ui.isMenuOpen')) {
                        this.close();
                    }
                });
            },
            
            open() {
                AppState.set('ui.isMenuOpen', true);
                this._menuEl?.classList.add('side-menu--open');
                this._overlayEl?.classList.add('menu-overlay--visible');
                document.body.style.overflow = 'hidden';
                
                // Focus trap
                const firstFocusable = this._menuEl?.querySelector('button, a');
                firstFocusable?.focus();
            },
            
            close() {
                AppState.set('ui.isMenuOpen', false);
                this._menuEl?.classList.remove('side-menu--open');
                this._overlayEl?.classList.remove('menu-overlay--visible');
                document.body.style.overflow = '';
            },
            
            toggle() {
                if (AppState.get('ui.isMenuOpen')) {
                    this.close();
                } else {
                    this.open();
                }
            },
            
            updateTeacherInfo() {
                const teacherInfoBox = Utils.$('#teacherInfoBox');
                const role = AppState.get('userInfo.role');
                
                if (role === 'teacher') {
                    teacherInfoBox?.classList.remove('hidden');
                    
                    const roomInfo = AppState.get('roomInfo');
                    Utils.$('#menuRoomId').textContent = roomInfo.roomId || '';
                    Utils.$('#menuRoomPassword').textContent = roomInfo.password || '';
                } else {
                    teacherInfoBox?.classList.add('hidden');
                }
            }
        };

        /* =============================================
           Form Validation
           ============================================= */
        const FormValidator = {
            _errors: new Map(),
            
            validate(formId) {
                this._errors.clear();
                
                if (formId === 'teacherFormElement') {
                    return this._validateTeacherForm();
                } else if (formId === 'studentFormElement') {
                    return this._validateStudentForm();
                }
                
                return false;
            },
            
            _validateTeacherForm() {
                const fields = {
                    teacherName: { type: 'name', message: 'نام معتبر وارد کنید' },
                    className: { type: 'className', message: 'نام کلاس فقط حروف انگلیسی و اعداد' },
                    roomId: { type: 'roomId', message: 'شناسه حداقل ۶ کاراکتر انگلیسی/عدد' },
                    roomPassword: { type: 'password', message: 'رمز عبور معتبر نیست' }
                };
                
                return this._validateFields(fields);
            },
            
            _validateStudentForm() {
                const fields = {
                    studentName: { type: 'name', message: 'نام معتبر وارد کنید' },
                    studentRoomId: { type: 'required', message: 'شناسه اتاق الزامی است' },
                    studentRoomPassword: { type: 'required', message: 'رمز عبور الزامی است' }
                };
                
                return this._validateFields(fields);
            },
            
            _validateFields(fields) {
                let isValid = true;
                
                Object.entries(fields).forEach(([fieldId, config]) => {
                    const input = Utils.$(`#${fieldId}`);
                    const value = input?.value?.trim() || '';
                    
                    const valid = Utils.validateInput(value, config.type);
                    
                    if (!valid) {
                        isValid = false;
                        this._errors.set(fieldId, config.message);
                        this._showFieldError(fieldId, true);
                    } else {
                        this._showFieldError(fieldId, false);
                    }
                });
                
                return isValid;
            },
            
            _showFieldError(fieldId, show) {
                const input = Utils.$(`#${fieldId}`);
                const errorEl = Utils.$(`#${fieldId}Error`);
                
                if (show) {
                    input?.classList.add('form-input--error');
                    errorEl?.classList.add('form-error--visible');
                } else {
                    input?.classList.remove('form-input--error');
                    errorEl?.classList.remove('form-error--visible');
                }
            },
            
            getErrors() {
                return this._errors;
            },
            
            getFirstError() {
                return this._errors.values().next().value || null;
            }
        };

        /* =============================================
           View Manager
           ============================================= */
        const ViewManager = {
            _views: {
                roleSelection: Utils.$('#roleSelection'),
                teacherForm: Utils.$('#teacherForm'),
                studentForm: Utils.$('#studentForm'),
                loginScreen: Utils.$('#loginScreen'),
                classroom: Utils.$('#classroom'),
                mainHeader: Utils.$('#mainHeader')
            },
            
            init() {
                this._views = {
                    roleSelection: Utils.$('#roleSelection'),
                    teacherForm: Utils.$('#teacherForm'),
                    studentForm: Utils.$('#studentForm'),
                    loginScreen: Utils.$('#loginScreen'),
                    classroom: Utils.$('#classroom'),
                    mainHeader: Utils.$('#mainHeader')
                };
            },
            
            showRoleSelection() {
                AppState.set('currentView', 'roleSelection');
                
                this._views.roleSelection?.classList.remove('hidden');
                this._views.teacherForm?.classList.add('hidden');
                this._views.studentForm?.classList.add('hidden');
                Utils.$('#successMessage')?.classList.add('hidden');
                
                this._views.loginScreen?.classList.remove('hidden');
                this._views.mainHeader?.classList.remove('hidden');
                this._views.classroom?.classList.remove('classroom--active');
            },
            
            showTeacherForm() {
                AppState.set('currentView', 'teacherForm');
                AppState.set('currentRole', 'teacher');
                
                this._views.roleSelection?.classList.add('hidden');
                this._views.teacherForm?.classList.remove('hidden');
                this._views.studentForm?.classList.add('hidden');
                
                // Generate room ID
                Utils.$('#roomId').value = Utils.generateId('class', 8);
                
                // Focus first input
                setTimeout(() => Utils.$('#teacherName')?.focus(), 100);
            },
            
            showStudentForm() {
                AppState.set('currentView', 'studentForm');
                AppState.set('currentRole', 'student');
                
                this._views.roleSelection?.classList.add('hidden');
                this._views.teacherForm?.classList.add('hidden');
                this._views.studentForm?.classList.remove('hidden');
                
                // Focus first input
                setTimeout(() => Utils.$('#studentName')?.focus(), 100);
            },
            
            showSuccessMessage(roomId, password) {
                Utils.$('#roomIdDisplay').textContent = roomId;
                Utils.$('#roomPassDisplay').textContent = password;
                Utils.$('#successMessage')?.classList.remove('hidden');
                
                // Scroll to success message
                Utils.$('#successMessage')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            },
            
            showClassroom() {
                AppState.set('currentView', 'classroom');
                AppState.set('classroom.isActive', true);
                
                this._views.loginScreen?.classList.add('hidden');
                this._views.mainHeader?.classList.add('hidden');
                this._views.classroom?.classList.add('classroom--active');
                
                // Update classroom UI
                this._updateClassroomUI();
                
                // Start timer
                ClassroomManager.startTimer();
                
                // Update menu
                Menu.updateTeacherInfo();
            },
            
            _updateClassroomUI() {
                const roomInfo = AppState.get('roomInfo');
                const userInfo = AppState.get('userInfo');
                const role = userInfo.role;
                
                // Class name
                Utils.$('#classNameDisplay').textContent = roomInfo.className || `کلاس ${roomInfo.roomId}`;
                
                // User info
                Utils.$('#userNameDisplay').textContent = userInfo.name;
                
                // Role badge
                const roleDisplay = Utils.$('#userRoleDisplay');
                roleDisplay.className = `classroom__role classroom__role--${role}`;
                
                // Video label
                const videoLabel = Utils.$('#videoLabel');
                const videoLabelText = Utils.$('#videoLabelText');
                
                videoLabelText.textContent = `${role === 'teacher' ? 'استاد' : 'دانش‌آموز'}: ${userInfo.name}`;
                
                if (role === 'student') {
                    videoLabel.classList.add('video-label--student');
                } else {
                    videoLabel.classList.remove('video-label--student');
                }
                
                // Whiteboard button (teacher only)
                const whiteboardBtn = Utils.$('#whiteboardBtn');
                if (role === 'teacher') {
                    whiteboardBtn?.classList.remove('hidden');
                } else {
                    whiteboardBtn?.classList.add('hidden');
                }
            }
        };

        /* =============================================
           Classroom Manager
           ============================================= */
        const ClassroomManager = {
            _timerInterval: null,
            
            async createClass() {
                const teacherName = Utils.$('#teacherName').value.trim();
                const className = Utils.$('#className').value.trim();
                const roomId = Utils.$('#roomId').value.trim();
                const password = Utils.$('#roomPassword').value.trim();
                
                // Save to state
                AppState.set('roomInfo', { roomId, password, className });
                AppState.set('userInfo', { name: teacherName, role: 'teacher' });
                
                // Save to storage
                StorageManager.saveClassHistory('teacher', {
                    roomId,
                    password,
                    className,
                    teacherName,
                    timestamp: Date.now()
                });
                
                // Show success
                ViewManager.showSuccessMessage(roomId, password);
                Toast.success('کلاس با موفقیت ایجاد شد!');
            },
            
            async enterClassAsTeacher() {
                await Loading.withLoading(async () => {
                    // Check server connectivity
                    const isOnline = await this._checkServer();
                    
                    if (!isOnline) {
                        throw new Error('اتصال به سرور برقرار نشد');
                    }
                    
                    // Build URL
                    const roomInfo = AppState.get('roomInfo');
                    const isMinimal = AppState.get('settings.isMinimalRoom');
                    
                    let url = `${CONFIG.SERVER_URL}/?proxy&director=${encodeURIComponent(roomInfo.roomId)}&password=${encodeURIComponent(roomInfo.password)}&showdirector`;
                    
                    if (isMinimal) {
                        url += '&minidirector';
                    }
                    
                    // Set iframe src
                    Utils.$('#videoFrame').src = url;
                    
                    // Show classroom
                    ViewManager.showClassroom();
                    
                }, 'در حال ورود به کلاس...');
                
                Toast.success('به کلاس خوش آمدید!');
            },
            
            async joinClass() {
                const studentName = Utils.$('#studentName').value.trim();
                const roomId = Utils.$('#studentRoomId').value.trim();
                const password = Utils.$('#studentRoomPassword').value.trim();
                
                await Loading.withLoading(async () => {
                    // Check server connectivity
                    const isOnline = await this._checkServer();
                    
                    if (!isOnline) {
                        throw new Error('اتصال به سرور برقرار نشد');
                    }
                    
                    // Save to state
                    AppState.set('roomInfo', { roomId, password, className: '' });
                    AppState.set('userInfo', { name: studentName, role: 'student' });
                    
                    // Save to storage
                    StorageManager.saveClassHistory('student', {
                        roomId,
                        password,
                        studentName,
                        timestamp: Date.now()
                    });
                    
                    // Build URL
                    const url = `${CONFIG.SERVER_URL}/?room=${encodeURIComponent(roomId)}&p=${encodeURIComponent(password)}&sl&broadcast`;
                    
                    // Set iframe src
                    Utils.$('#videoFrame').src = url;
                    
                    // Show classroom
                    ViewManager.showClassroom();
                    
                }, 'در حال پیوستن به کلاس...');
                
                Toast.success('به کلاس خوش آمدید!');
            },
            
            leaveClass() {
                if (!confirm('آیا از خروج از کلاس اطمینان دارید؟')) {
                    return;
                }
                
                // Stop timer
                this.stopTimer();
                
                // Clear iframe
                Utils.$('#videoFrame').src = '';
                
                // Exit fullscreen if active
                if (AppState.get('classroom.isFullscreen')) {
                    this.exitFullscreen();
                }
                
                // Close menu
                Menu.close();
                
                // Reset state
                AppState.set('classroom.isActive', false);
                AppState.set('currentRole', null);
                
                // Show login
                ViewManager.showRoleSelection();
                
                Toast.success('از کلاس خارج شدید');
            },
            
            startTimer() {
                AppState.set('classroom.startTime', Date.now());
                
                this._timerInterval = setInterval(() => {
                    const startTime = AppState.get('classroom.startTime');
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    Utils.$('#classTimer').textContent = Utils.formatTime(elapsed);
                }, 1000);
            },
            
            stopTimer() {
                if (this._timerInterval) {
                    clearInterval(this._timerInterval);
                    this._timerInterval = null;
                }
            },
            
            toggleFullscreen() {
                const iframe = Utils.$('#videoFrame');
                
                if (!AppState.get('classroom.isFullscreen')) {
                    this._enterFullscreen(iframe);
                } else {
                    this._exitFullscreen();
                }
            },
            
            _enterFullscreen(element) {
                if (element.requestFullscreen) {
                    element.requestFullscreen();
                } else if (element.webkitRequestFullscreen) {
                    element.webkitRequestFullscreen();
                } else if (element.mozRequestFullScreen) {
                    element.mozRequestFullScreen();
                } else if (element.msRequestFullscreen) {
                    element.msRequestFullscreen();
                }
                
                AppState.set('classroom.isFullscreen', true);
                this._updateFullscreenUI(true);
            },
            
            _exitFullscreen() {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
                
                AppState.set('classroom.isFullscreen', false);
                this._updateFullscreenUI(false);
            },
            
            _updateFullscreenUI(isFullscreen) {
                const btn = Utils.$('#fullscreenBtn');
                const icon = Utils.$('#fullscreenIcon');
                
                if (isFullscreen) {
                    icon.innerHTML = `
                        <polyline points="4 14 10 14 10 20"></polyline>
                        <polyline points="20 10 14 10 14 4"></polyline>
                        <line x1="14" y1="10" x2="21" y2="3"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    `;
                } else {
                    icon.innerHTML = `
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    `;
                }
            },
            
            openWhiteboard() {
                const role = AppState.get('userInfo.role');
                
                if (role !== 'teacher') {
                    Toast.warning('فقط اساتید می‌توانند از تخته استفاده کنند');
                    return;
                }
                
                const newTab = window.open(CONFIG.WHITEBOARD_URL, '_blank');
                
                if (newTab) {
                    Toast.success('تخته در پنجره جدید باز شد');
                } else {
                    Toast.error('لطفاً popup blocker را غیرفعال کنید');
                }
            },
            
            async _checkServer() {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    
                    await fetch(CONFIG.SERVER_URL, { 
                        method: 'HEAD', 
                        mode: 'no-cors',
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    return true;
                } catch (error) {
                    console.error('Server check failed:', error);
                    return true; // Assume online for no-cors
                }
            },
            
            getDirectLink() {
                const roomInfo = AppState.get('roomInfo');
                return `${CONFIG.SERVER_URL}/?room=${encodeURIComponent(roomInfo.roomId)}&p=${encodeURIComponent(roomInfo.password)}&sl&broadcast`;
            }
        };

        /* =============================================
           History Manager
           ============================================= */
        const HistoryManager = {
            populateSelects() {
                this._populateTeacherHistory();
                this._populateStudentHistory();
            },
            
            _populateTeacherHistory() {
                const select = Utils.$('#teacherClassHistory');
                if (!select) return;
                
                const history = StorageManager.getClassHistory('teacher');
                
                select.innerHTML = '<option value="">انتخاب کلاس قبلی (اختیاری)</option>';
                
                history.forEach(cls => {
                    const option = Utils.createElement('option', { value: cls.roomId }, [
                        `${cls.className} (${cls.teacherName})`
                    ]);
                    select.appendChild(option);
                });
            },
            
            _populateStudentHistory() {
                const select = Utils.$('#studentClassHistory');
                if (!select) return;
                
                const history = StorageManager.getClassHistory('student');
                
                select.innerHTML = '<option value="">انتخاب کلاس قبلی (اختیاری)</option>';
                
                history.forEach(cls => {
                    const option = Utils.createElement('option', { value: cls.roomId }, [
                        `${cls.roomId} (${cls.studentName})`
                    ]);
                    select.appendChild(option);
                });
            },
            
            loadTeacherClass(roomId) {
                if (!roomId) {
                    this._clearTeacherForm();
                    return;
                }
                
                const history = StorageManager.getClassHistory('teacher');
                const cls = history.find(c => c.roomId === roomId);
                
                if (cls) {
                    Utils.$('#teacherName').value = cls.teacherName || '';
                    Utils.$('#className').value = cls.className || '';
                    Utils.$('#roomId').value = cls.roomId || '';
                    Utils.$('#roomPassword').value = cls.password || '';
                }
            },
            
            loadStudentClass(roomId) {
                if (!roomId) {
                    this._clearStudentForm();
                    return;
                }
                
                const history = StorageManager.getClassHistory('student');
                const cls = history.find(c => c.roomId === roomId);
                
                if (cls) {
                    Utils.$('#studentName').value = cls.studentName || '';
                    Utils.$('#studentRoomId').value = cls.roomId || '';
                    Utils.$('#studentRoomPassword').value = cls.password || '';
                }
            },
            
            _clearTeacherForm() {
                Utils.$('#teacherName').value = '';
                Utils.$('#className').value = '';
                Utils.$('#roomId').value = Utils.generateId('class', 8);
                Utils.$('#roomPassword').value = '';
            },
            
            _clearStudentForm() {
                Utils.$('#studentName').value = '';
                Utils.$('#studentRoomId').value = '';
                Utils.$('#studentRoomPassword').value = '';
            }
        };

        /* =============================================
           Event Handlers
           ============================================= */
        const EventHandlers = {
            init() {
                this._bindRoleSelection();
                this._bindForms();
                this._bindClassroom();
                this._bindGlobal();
                this._bindCopyButtons();
            },
            
            _bindRoleSelection() {
                // Role cards
                Utils.$$('.role-card').forEach(card => {
                    const handler = () => {
                        const role = card.dataset.role;
                        if (role === 'teacher') {
                            ViewManager.showTeacherForm();
                        } else if (role === 'student') {
                            ViewManager.showStudentForm();
                        }
                    };
                    
                    card.addEventListener('click', handler);
                    card.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handler();
                        }
                    });
                });
            },
            
            _bindForms() {
                // Teacher form
                Utils.$('#teacherFormElement')?.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    if (!FormValidator.validate('teacherFormElement')) {
                        Toast.error(FormValidator.getFirstError());
                        return;
                    }
                    
                    await ClassroomManager.createClass();
                });
                
                Utils.$('#teacherBackBtn')?.addEventListener('click', () => {
                    ViewManager.showRoleSelection();
                });
                
                Utils.$('#enterClassBtn')?.addEventListener('click', async () => {
                    try {
                        await ClassroomManager.enterClassAsTeacher();
                    } catch (error) {
                        Toast.error(error.message || 'خطا در ورود به کلاس');
                    }
                });
                
                // Student form
                Utils.$('#studentFormElement')?.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    if (!FormValidator.validate('studentFormElement')) {
                        Toast.error(FormValidator.getFirstError());
                        return;
                    }
                    
                    try {
                        await ClassroomManager.joinClass();
                    } catch (error) {
                        Toast.error(error.message || 'خطا در پیوستن به کلاس');
                    }
                });
                
                Utils.$('#studentBackBtn')?.addEventListener('click', () => {
                    ViewManager.showRoleSelection();
                });
                
                // History selects
                Utils.$('#teacherClassHistory')?.addEventListener('change', (e) => {
                    HistoryManager.loadTeacherClass(e.target.value);
                });
                
                Utils.$('#studentClassHistory')?.addEventListener('change', (e) => {
                    HistoryManager.loadStudentClass(e.target.value);
                });
                
                // Input validation with debounce
                const debouncedValidation = Utils.debounce((input, type) => {
                    const isValid = Utils.validateInput(input.value, type);
                    const errorId = `${input.id}Error`;
                    
                    if (!isValid && input.value.length > 0) {
                        input.classList.add('form-input--error');
                        Utils.$(`#${errorId}`)?.classList.add('form-error--visible');
                    } else {
                        input.classList.remove('form-input--error');
                        Utils.$(`#${errorId}`)?.classList.remove('form-error--visible');
                    }
                }, CONFIG.DEBOUNCE_DELAY);
                
                Utils.$('#className')?.addEventListener('input', function() {
                    // Only allow alphanumeric
                    this.value = this.value.replace(/[^a-zA-Z0-9]/g, '');
                    debouncedValidation(this, 'className');
                });
                
                Utils.$('#roomId')?.addEventListener('input', function() {
                    this.value = this.value.replace(/[^a-zA-Z0-9]/g, '');
                    debouncedValidation(this, 'roomId');
                });
                
                Utils.$('#roomPassword')?.addEventListener('input', function() {
                    debouncedValidation(this, 'password');
                });
                
                // Toggle switches
                Utils.$('#simplePassword')?.addEventListener('change', (e) => {
                    AppState.set('settings.isSimplePassword', e.target.checked);
                    
                    const helpText = Utils.$('#passwordHelp');
                    if (helpText) {
                        helpText.innerHTML = e.target.checked
                            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> حداقل ۴ کاراکتر'
                            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> حداقل ۸ کاراکتر با حروف و اعداد';
                    }
                });
                
                Utils.$('#minimalRoom')?.addEventListener('change', (e) => {
                    AppState.set('settings.isMinimalRoom', e.target.checked);
                });
            },
            
            _bindClassroom() {
                Utils.$('#leaveClassBtn')?.addEventListener('click', () => {
                    ClassroomManager.leaveClass();
                });
                
                Utils.$('#fullscreenBtn')?.addEventListener('click', () => {
                    ClassroomManager.toggleFullscreen();
                });
                
                Utils.$('#whiteboardBtn')?.addEventListener('click', () => {
                    ClassroomManager.openWhiteboard();
                });
                
                // Fullscreen change events
                document.addEventListener('fullscreenchange', this._handleFullscreenChange);
                document.addEventListener('webkitfullscreenchange', this._handleFullscreenChange);
                document.addEventListener('mozfullscreenchange', this._handleFullscreenChange);
                document.addEventListener('MSFullscreenChange', this._handleFullscreenChange);
            },
            
            _handleFullscreenChange() {
                const isFullscreen = !!(
                    document.fullscreenElement ||
                    document.webkitFullscreenElement ||
                    document.mozFullScreenElement ||
                    document.msFullscreenElement
                );
                
                AppState.set('classroom.isFullscreen', isFullscreen);
                ClassroomManager._updateFullscreenUI(isFullscreen);
            },
            
            _bindGlobal() {
                // Keyboard shortcuts
                document.addEventListener('keydown', (e) => {
                    // F11 - Fullscreen
                    if (e.key === 'F11' && AppState.get('classroom.isActive')) {
                        e.preventDefault();
                        ClassroomManager.toggleFullscreen();
                    }
                });
                
                // Network status
                window.addEventListener('online', () => {
                    Toast.success('اتصال اینترنت برقرار شد');
                });
                
                window.addEventListener('offline', () => {
                    Toast.error('اتصال اینترنت قطع شد');
                });
                
                // Before unload warning
                window.addEventListener('beforeunload', (e) => {
                    if (AppState.get('classroom.isActive')) {
                        e.preventDefault();
                        e.returnValue = 'آیا از خروج از کلاس اطمینان دارید؟';
                    }
                });
                
                // Visibility change
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        console.log('User left the tab');
                    } else {
                        console.log('User returned to the tab');
                    }
                });
            },
            
            _bindCopyButtons() {
                Utils.$$('.btn--copy').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const targetId = btn.dataset.copy;
                        let text = '';
                        
                        if (targetId) {
                            text = Utils.$(`#${targetId}`)?.textContent || '';
                        }
                        
                        const success = await Utils.copyToClipboard(text);
                        
                        if (success) {
                            Toast.success('کپی شد!');
                        } else {
                            Toast.error('خطا در کپی کردن');
                        }
                    });
                });
                
                // Special handler for direct link copy
                Utils.$('#copyDirectLinkBtn')?.addEventListener('click', async () => {
                    const link = ClassroomManager.getDirectLink();
                    const success = await Utils.copyToClipboard(link);
                    
                    if (success) {
                        Toast.success('لینک کپی شد!');
                    } else {
                        Toast.error('خطا در کپی کردن');
                    }
                });
            }
        };

        /* =============================================
           Application Initialization
           ============================================= */
        const App = {
            async init() {
                console.log('🎓 RemoteVM Class v2.0 - Initializing...');
                
                try {
                    // Initialize components
                    ViewManager.init();
                    Toast.init();
                    Loading.init();
                    Menu.init();
                    
                    // Bind events
                    EventHandlers.init();
                    
                    // Load history
                    HistoryManager.populateSelects();
                    
                    // Check browser compatibility
                    this._checkBrowser();
                    
                    console.log('✅ RemoteVM Class initialized successfully');
                    
                } catch (error) {
                    console.error('❌ Initialization error:', error);
                    Toast.error('خطا در راه‌اندازی برنامه');
                }
            },
            
            _checkBrowser() {
                const ua = navigator.userAgent;
                const isSupported = /Chrome|Firefox|Safari|Edge/.test(ua);
                
                if (!isSupported) {
                    Toast.warning('برای تجربه بهتر از Chrome یا Firefox استفاده کنید');
                }
                
                // Check WebRTC support
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    Toast.warning('مرورگر شما از ویدیو کنفرانس پشتیبانی نمی‌کند');
                }
            }
        };

        /* =============================================
           Start Application
           ============================================= */
        document.addEventListener('DOMContentLoaded', () => App.init());
