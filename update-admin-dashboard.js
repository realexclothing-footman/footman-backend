// Update the admin dashboard to show partner verification
const fs = require('fs');
const path = require('path');

// Read the current dashboard
const dashboardPath = path.join(__dirname, 'admin-dashboard-v2.html');
let content = fs.readFileSync(dashboardPath, 'utf8');

// Find the delivery partners table rendering function
const findStr = 'function renderDeliveryTable(partners) {';
const insertIndex = content.indexOf(findStr);

if (insertIndex !== -1) {
    // Find the end of the function
    let functionEnd = content.indexOf('}', insertIndex);
    let braceCount = 1;
    for (let i = insertIndex + findStr.length; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        if (braceCount === 0) {
            functionEnd = i;
            break;
        }
    }
    
    // New function with document viewing
    const newFunction = `function renderDeliveryTable(partners) {
    const tbody = document.getElementById('deliveryTable');
    tbody.innerHTML = '';

    if (partners.length === 0) {
        tbody.innerHTML = \`
            <tr>
                <td colspan="8" class="empty-state">
                    No delivery partners found
                </td>
            </tr>
        \`;
        return;
    }

    partners.forEach(partner => {
        // Online status
        const onlineStatus = partner.is_online ? 
            '<span class="badge badge-success">🟢 Online</span>' : 
            '<span class="badge badge-secondary">⚫ Offline</span>';
        
        // Approval status
        const approvalStatus = partner.is_active ? 
            '<span class="badge badge-success">✅ Approved</span>' : 
            '<span class="badge badge-warning">⏳ Pending</span>';
        
        // Document indicator
        const hasDocs = (partner.profile_image_url && partner.profile_image_url !== 'null') ||
                       (partner.nid_front_image_url && partner.nid_front_image_url !== 'null') ||
                       (partner.nid_back_image_url && partner.nid_back_image_url !== 'null');
        
        const docsIndicator = hasDocs ? 
            '<span class="badge badge-info">📄 Has Documents</span>' : 
            '<span class="badge badge-danger">❌ No Docs</span>';
        
        const row = document.createElement('tr');
        row.innerHTML = \`
            <td>\${partner.id}</td>
            <td>\${partner.full_name || 'N/A'}</td>
            <td>\${partner.phone}</td>
            <td>\${partner.nid_number || 'N/A'}</td>
            <td>\${onlineStatus}</td>
            <td>\${approvalStatus}</td>
            <td>\${docsIndicator}</td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="viewPartnerDetails(\${partner.id})">
                        👁️ View Details
                    </button>
                    \${!partner.is_active ? \`
                        <button class="btn btn-success btn-sm" onclick="approvePartner(\${partner.id})">
                            ✓ Approve
                        </button>
                    \` : ''}
                </div>
            </td>
        \`;
        
        tbody.appendChild(row);
    });
}`;

    // Replace the function
    content = content.substring(0, insertIndex) + newFunction + content.substring(functionEnd + 1);
    
    // Add viewPartnerDetails function before the closing script tag
    const scriptEnd = content.lastIndexOf('</script>');
    const newFunctions = `
        // View partner details with documents
        async function viewPartnerDetails(userId) {
            try {
                const allUsers = await apiRequest('/admin/users?limit=100');
                if (!allUsers?.success) return;
                
                const partner = allUsers.data.users.find(u => u.id === userId);
                if (!partner) {
                    alert('Partner not found');
                    return;
                }
                
                // Create modal HTML
                const modalHTML = \`
                    <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;">
                        <div style="background:white;border-radius:12px;width:90%;max-width:800px;max-height:90vh;overflow-y:auto;">
                            <div style="padding:20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                                <h2 style="margin:0;">Partner: \${partner.full_name || 'N/A'}</h2>
                                <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">×</button>
                            </div>
                            <div style="padding:20px;">
                                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:20px;margin-bottom:30px;">
                                    <div>
                                        <h3>Basic Info</h3>
                                        <p><strong>Phone:</strong> \${partner.phone}</p>
                                        <p><strong>NID:</strong> \${partner.nid_number || 'N/A'}</p>
                                        <p><strong>Status:</strong> \${partner.is_active ? '✅ Approved' : '⏳ Pending'}</p>
                                        <p><strong>Online:</strong> \${partner.is_online ? '🟢 Online' : '⚫ Offline'}</p>
                                    </div>
                                    <div>
                                        <h3>Documents</h3>
                                        \${partner.profile_image_url && partner.profile_image_url !== 'null' ? 
                                            \`<p><strong>Profile Photo:</strong> <a href="\${partner.profile_image_url}" target="_blank">View</a></p>\` : 
                                            '<p><strong>Profile Photo:</strong> ❌ Not uploaded</p>'}
                                        \${partner.nid_front_image_url && partner.nid_front_image_url !== 'null' ? 
                                            \`<p><strong>NID Front:</strong> <a href="\${partner.nid_front_image_url}" target="_blank">View</a></p>\` : 
                                            '<p><strong>NID Front:</strong> ❌ Not uploaded</p>'}
                                        \${partner.nid_back_image_url && partner.nid_back_image_url !== 'null' ? 
                                            \`<p><strong>NID Back:</strong> <a href="\${partner.nid_back_image_url}" target="_blank">View</a></p>\` : 
                                            '<p><strong>NID Back:</strong> ❌ Not uploaded</p>'}
                                    </div>
                                </div>
                                
                                <div style="margin-top:20px;padding-top:20px;border-top:1px solid #e2e8f0;">
                                    <h3>Document Preview</h3>
                                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:20px;margin-top:15px;">
                                        \${partner.profile_image_url && partner.profile_image_url !== 'null' ? 
                                            \`<div>
                                                <p style="font-size:12px;color:#666;margin-bottom:5px;">Profile Photo</p>
                                                <img src="\${partner.profile_image_url}" style="width:100%;border-radius:8px;border:1px solid #ddd;">
                                            </div>\` : ''}
                                        \${partner.nid_front_image_url && partner.nid_front_image_url !== 'null' ? 
                                            \`<div>
                                                <p style="font-size:12px;color:#666;margin-bottom:5px;">NID Front</p>
                                                <img src="\${partner.nid_front_image_url}" style="width:100%;border-radius:8px;border:1px solid #ddd;">
                                            </div>\` : ''}
                                        \${partner.nid_back_image_url && partner.nid_back_image_url !== 'null' ? 
                                            \`<div>
                                                <p style="font-size:12px;color:#666;margin-bottom:5px;">NID Back</p>
                                                <img src="\${partner.nid_back_image_url}" style="width:100%;border-radius:8px;border:1px solid #ddd;">
                                            </div>\` : ''}
                                    </div>
                                </div>
                                
                                <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;">
                                    \${!partner.is_active ? 
                                        \`<button onclick="approvePartner(\${partner.id}, true)" style="padding:10px 20px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;">
                                            ✓ Approve Partner
                                        </button>\` : 
                                        \`<button onclick="deactivatePartner(\${partner.id}, true)" style="padding:10px 20px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;">
                                            ✗ Deactivate
                                        </button>\`}
                                    <button onclick="this.parentElement.parentElement.parentElement.remove()" style="padding:10px 20px;background:#64748b;color:white;border:none;border-radius:6px;cursor:pointer;">
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                \`;
                
                // Add to body
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                
            } catch (error) {
                console.error('Error viewing partner:', error);
                alert('Error loading partner details');
            }
        }
        
        // Deactivate partner
        async function deactivatePartner(userId, fromModal = false) {
            if (!confirm('Deactivate this partner? They won\\'t be able to work.')) return;
            
            try {
                const result = await apiRequest(\`/admin/users/\${userId}/status\`, {
                    method: 'PUT',
                    body: JSON.stringify({ is_active: false })
                });
                
                if (result?.success) {
                    alert('Partner deactivated');
                    if (fromModal) {
                        document.querySelector('div[style*="position:fixed"]')?.remove();
                    }
                    loadCurrentPage();
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }
        
        // Rename existing approveUser to approvePartner for consistency
        const approvePartner = window.approveUser || async function(userId, fromModal = false) {
            if (!confirm('Approve this delivery partner?')) return;
            
            try {
                const result = await apiRequest(\`/admin/users/\${userId}/status\`, {
                    method: 'PUT',
                    body: JSON.stringify({ is_active: true })
                });
                
                if (result?.success) {
                    alert('Partner approved successfully!');
                    if (fromModal) {
                        document.querySelector('div[style*="position:fixed"]')?.remove();
                    }
                    loadCurrentPage();
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        };
        window.approvePartner = approvePartner;
    `;
    
    content = content.substring(0, scriptEnd) + newFunctions + content.substring(scriptEnd);
    
    // Also update the dashboard stats to show online partners
    const dashboardStats = content.indexOf('// Load activity (simulated)');
    if (dashboardStats !== -1) {
        const updateStats = `
                // Count online partners
                const onlinePartners = allUsers.data.users.filter(u => u.user_type === 'delivery' && u.is_online).length;
                document.getElementById('deliveryPartners').textContent = deliveryCount;
                document.getElementById('onlinePartnersBadge').textContent = onlinePartners;
        `;
        
        // Find where to insert
        const insertPoint = content.indexOf('document.getElementById(\'deliveryPartners\').textContent = deliveryCount;');
        if (insertPoint !== -1) {
            content = content.substring(0, insertPoint) + updateStats + content.substring(insertPoint);
        }
    }
    
    // Add online partners badge to sidebar if not exists
    if (!content.includes('onlinePartnersBadge')) {
        const navItem = content.indexOf('data-page="delivery"');
        if (navItem !== -1) {
            const badge = ' <span class="badge badge-success ml-auto" id="onlinePartnersBadge">0</span>';
            content = content.replace(
                'data-page="delivery">',
                `data-page="delivery">🚚 Delivery Partners${badge}`
            );
        }
    }
    
    // Save updated file
    fs.writeFileSync(dashboardPath, content);
    console.log('✅ Admin dashboard updated successfully!');
    
    // Also update public folder
    const publicPath = path.join(__dirname, 'public', 'admin-dashboard-v2.html');
    fs.copyFileSync(dashboardPath, publicPath);
    console.log('✅ Public folder updated!');
    
} else {
    console.log('❌ Could not find the function to update');
}
