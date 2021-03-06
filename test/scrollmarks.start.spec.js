describe('Scrollmarks.start()', function () {
	
	before(function () {
		fixture.setBase('test/fixtures');
		fixture.load('static_position.html');
		this.element = document.getElementById('static');
	});
			
	beforeEach(function () {
		Scrollmarks.stop();
		scrollTo(0, 0);
	});

	after(function () {
		fixture.cleanup();
	});

	it('should exist', function () {
		Scrollmarks.start.should.be.a('function');
	});

	it('should start listening', function (done) {
		var callback = sinon.spy();
		var mark = Scrollmarks.add({element: this.element, callback: callback});
		
		Scrollmarks.stop();
		Scrollmarks.start();
		
		window.scrollWithEvent(100);

		setTimeout(function () {
			callback.should.have.been.calledOnce;
			Scrollmarks.remove(mark);
			done();
		}, getTimeout());
	});

	it('should trigger callback if element is passed and direction is not \'up\'', function (done) {
		var callback = sinon.spy();
		var downCallback = sinon.spy();
		var upCallback = sinon.spy();
		var marks = [];

		marks.push(Scrollmarks.add({element: this.element, callback: callback}));
		marks.push(Scrollmarks.add({element: this.element, callback: downCallback, direction: 'down'}));
		marks.push(Scrollmarks.add({element: this.element, callback: upCallback, direction: 'up'}));
		Scrollmarks.stop();
		window.scrollWithEvent(100);
		Scrollmarks.start();
		
		setTimeout(function () {
			callback.should.have.been.calledOnce;
			downCallback.should.have.been.calledOnce;
			upCallback.should.not.have.been.called;
			marks.forEach(function (mark) {
				Scrollmarks.remove(mark);
			});
			done();
		}, getTimeout());
	});

});