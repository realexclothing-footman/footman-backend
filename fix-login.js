const fs = require('fs');
const content = fs.readFileSync('admin-panel-pro.html', 'utf8');

// Remove login button event listener from setupNavigation
let newContent = content.replace(
    /            \/\/ Login button[\s\S]*?            \);\n            \n            \/\/ Enter key in login form[\s\S]*?            \);/,
    ''
);

// Add login button listener at document ready
const loginFix = `
        // Attach login button immediately when page loads
        document.addEventListener('DOMContentLoaded', function() {
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) {
                loginBtn.addEventListener('click', () => {
                    const phone = document.getElementById('loginPhone').value;
                    const password = document.getElementById('loginPassword').value;
                    if (!phone || !password) {
                        const errorDisplay = document.getElementById('loginError');
                        errorDisplay.textContent = 'Please enter phone and password';
                        errorDisplay.style.display = 'block';
                        return;
                    }
                    login(phone, password);
                });
                
                // Enter key in login form
                document.getElementById('loginPassword').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        loginBtn.click();
                    }
                });
            }
        });
        
        // Start the application
        document.addEventListener('DOMContentLoaded', initAuth);`;

// Add before the last script closing
newContent = newContent.replace(
    /        \/\/ Start the application\n        document.addEventListener\('DOMContentLoaded', initAuth\);\n    <\/script>/,
    loginFix + '\n    </script>'
);

fs.writeFileSync('admin-panel-pro.html', newContent);
console.log('Fixed login button event listener!');
