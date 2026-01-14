async function update() {
    try {
        const res = await fetch('http://localhost:3000/api/update-json', { method: 'POST' });
        console.log("Update Status:", res.status);
    } catch (e) {
        console.error("Error:", e);
    }
}
update();
