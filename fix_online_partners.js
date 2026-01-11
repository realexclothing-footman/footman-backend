const fs = require('fs');

// Read the file
let content = fs.readFileSync('admin-dashboard.html.fixed', 'utf8');

// The correct implementation
const onlinePartnersImplementation = `        // ========== ONLINE PARTNERS ==========
        async function loadOnlinePartners() {
            try {
                // Get all delivery partners
                const result = await apiRequest('/admin/users?user_type=delivery&limit=100');
                
                if (result.success) {
                    const allPartners = result.data.users;
                    // Filter only online partners (is_online = true)
                    const onlinePartners = allPartners.filter(partner => partner.is_online === true);
                    
                    renderOnlinePartnersTable(onlinePartners);
                    
                    const emptyState = document.getElementById("onlineEmpty");
                    const tableBody = document.getElementById("onlineTableBody");
                    if (onlinePartners.length === 0) {
                        emptyState.classList.remove("d-none");
                        tableBody.innerHTML = "";
                    } else {
                        emptyState.classList.add("d-none");
                    }
                    
                    // Update online count badge
                    document.getElementById("onlineCountBadge").textContent = onlinePartners.length;
                }
            } catch (error) {
                console.error("Error loading online partners:", error);
                document.getElementById("onlineTableBody").innerHTML = \`
                    <tr>
                        <td colspan="6" class="text-center text-danger">
                            Error loading online partners: \${error.message}
                        </td>
                    </tr>\`;
            }
        }

        function renderOnlinePartnersTable(partners) {
            const tbody = document.getElementById("onlineTableBody");
            tbody.innerHTML = "";
            
            partners.forEach(partner => {
                const initials = getInitials(partner.full_name);
                const hasProfileImage = partner.profile_image_url && 
                                        partner.profile_image_url !== "null" && 
                                        partner.profile_image_url !== "undefined";
                
                let currentJob = "Available";
                if (partner.current_order_id) {
                    currentJob = \`Order #\${partner.current_order_id}\`;
                }
                
                const row = document.createElement("tr");
                row.innerHTML = \`
                    <td>
                        <div class="user-info">
                            <div class="user-avatar">
                                \${hasProfileImage ? 
                                    \`<img src="\${partner.profile_image_url}" 
                                          alt="\${partner.full_name}" 
                                          style="width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid #fff;">\` :
                                    initials
                                }
                            </div>
                            <div class="user-details">
                                <div class="user-name">\${partner.full_name || "N/A"}</div>
                                <div class="user-email">\${partner.phone || "No phone"}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="badge badge-online">Online</span>
                    </td>
                    <td>\${currentJob}</td>
                    <td>
                        <div class="text-center">\${partner.rating || "N/A"}</div>
                        <small class="text-muted">from \${partner.rating_count || 0} reviews</small>
                    </td>
                    <td>\${formatTimeAgo(partner.last_active || partner.updated_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="showPartnerDetails(\${partner.id})">
                            👁️ View
                        </button>
                    </td>
                \`;
                
                tbody.appendChild(row);
            });
        }`;

// Replace the placeholder function
const placeholderPattern = /\/\/ ========== ONLINE PARTNERS \(PLACEHOLDER\) ==========\s+async function loadOnlinePartners\(\) \{[^}]+\}/s;
content = content.replace(placeholderPattern, onlinePartnersImplementation);

// Write the fixed file
fs.writeFileSync('admin-dashboard.html.fixed', content, 'utf8');
console.log('Fixed online partners function!');
