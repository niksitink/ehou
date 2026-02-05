document.addEventListener('DOMContentLoaded', () => {
    const widgetToggle = document.getElementById('widgetToggle');

    const updateToggleState = (show) => {
        if (!widgetToggle) return;
        // Mặc định là true nếu chưa được cài đặt
        const shouldBeChecked = show === undefined ? true : show;
        if (widgetToggle.checked !== shouldBeChecked) {
            widgetToggle.checked = shouldBeChecked;
        }
    };

    // 1. Tải trạng thái ban đầu
    chrome.storage.local.get('showResultWidget', (data) => {
        updateToggleState(data.showResultWidget);
    });

    // 2. Lắng nghe thay đổi từ các thành phần khác của extension
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.showResultWidget) {
            updateToggleState(changes.showResultWidget.newValue);
        }
    });

    // 3. Lưu lại trạng thái khi người dùng thay đổi
    if (widgetToggle) {
        widgetToggle.addEventListener('change', () => {
            chrome.storage.local.set({ showResultWidget: widgetToggle.checked });
        });
    }
}); 