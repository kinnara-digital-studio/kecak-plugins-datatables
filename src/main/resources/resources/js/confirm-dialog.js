/**
 * Confirm Dialog
 * @author: tiyojati
 */
(function () {

    window.ConfirmDialog = {

        dialog: null,

        /* ================= INIT ================= */
        init: function () {
            if ($('#confirmDialog').length) return;

            $('body').append(`
                <div id="confirmDialog" class="confirm-wrapper">
                    <div class="confirm-backdrop"></div>
                    <div class="confirm-box">
                        <div class="confirm-title"></div>
                        <div class="confirm-body"></div>
                        <div class="confirm-actions">
                            <button class="btn-cancel">Cancel</button>
                            <button class="btn-ok">OK</button>
                        </div>
                    </div>
                </div>
            `);

            this.dialog = $('#confirmDialog');
        },

        show: function (opts, onYes, onNo) {
            this.init();

            var dlg = this.dialog;

            dlg.find('.confirm-title')
                .text(opts.title || 'Confirmation');

            dlg.find('.confirm-body')
                .text(opts.message || '');

            dlg.show();

            dlg.find('.btn-ok').off().on('click', function () {
                dlg.hide();
                onYes && onYes();
            });

            dlg.find('.btn-cancel').off().on('click', function () {
                dlg.hide();
                onNo && onNo();
            });
        }
    };

    /* ================= GLOBAL SHORTCUT ================= */
    window.showConfirm = function (opts, yes, no) {
        ConfirmDialog.show(opts, yes, no);
    };

})();
