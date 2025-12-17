/**
 * Toast Dialog
 * @author: tiyojati
 */
(function () {

    window.ToastDialog = {

        container: null,
        toast: null,
        timer: null,

        /* ================= INIT ================= */
        init: function () {
            if ($('#toastContainer').length) {
                this.container = $('#toastContainer');
                this.toast = this.container.find('.toast');
                return;
            }

            var wrapper = $('#inlineTable_wrapper');
            if (!wrapper.length) wrapper = $('body');

            wrapper.append(`
                <div id="toastContainer" class="toast-container">
                    <div class="toast"></div>
                </div>
            `);

            this.container = $('#toastContainer');
            this.toast = this.container.find('.toast');
        },

        /* ================= SHOW ================= */
        show: function (message, type, duration) {
            this.init();

            type = type || 'info';
            duration = duration || 2200;

            this.toast
                .removeClass('toast-success toast-error toast-info toast-warning show')
                .addClass('toast-' + type)
                .text(message);

            this.container.show();

            setTimeout(() => {
                this.toast.addClass('show');
            }, 10);

            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.hide();
            }, duration);
        },

        hide: function () {
            var self = this;

            this.toast.removeClass('show');

            setTimeout(function () {
                self.container.hide();
            }, 250);
        }
    };

    /* ================= GLOBAL SHORTCUT ================= */
    window.showToast = function (msg, type, duration) {
        ToastDialog.show(msg, type, duration);
    };

})();
